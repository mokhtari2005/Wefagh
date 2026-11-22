#!/usr/bin/env python3
"""Respectful public crawler for the National Judicial Decisions portal.

Discovers only canonical judgment URLs linked from the public homepage or public
sitemaps. It never enumerates numeric IDs, signs in, bypasses CAPTCHAs, or follows
off-origin links. Full judgment text and metadata are imported as needs_review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests

try:
    from .parse_national_judgment import parse_judgment
except ImportError:  # direct script execution in GitHub Actions
    from parse_national_judgment import parse_judgment

BASE = "https://ara.jri.ac.ir/"
HOST = "ara.jri.ac.ir"
SOURCE_KEY = "national-judgments"
DB_ID = "a02aeb28-b6e7-4423-9671-1ce3f9e3038b"
USER_AGENT = "WefaghLegalResearchBot/1.0 (+https://mokhtari.ir/about; legal research indexing)"
DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


class PageLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.append(href.strip())


def canonical_judgment_url(value: str) -> str | None:
    absolute = urljoin(BASE, value)
    parsed = urlparse(absolute)
    match = re.fullmatch(r"/Judge/Text/(\d+)/?", parsed.path, re.I)
    if parsed.scheme != "https" or parsed.netloc.lower() not in {HOST, "www." + HOST} or not match:
        return None
    return f"https://{HOST}/Judge/Text/{match.group(1)}"


def same_origin_url(value: str) -> str | None:
    absolute = urljoin(BASE, value)
    parsed = urlparse(absolute)
    if parsed.scheme != "https" or parsed.netloc.lower() not in {HOST, "www." + HOST}:
        return None
    if parsed.path.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".svg", ".css", ".js", ".pdf", ".zip")):
        return None
    return absolute.split("#", 1)[0]


def robots_policy(session: requests.Session) -> RobotFileParser:
    url = urljoin(BASE, "robots.txt")
    response = session.get(url, timeout=30, allow_redirects=False)
    if 300 <= response.status_code < 400:
        raise PermissionError("robots.txt redirect requires manual source validation")
    if response.status_code == 404:
        parser = RobotFileParser()
        parser.set_url(url)
        parser.parse([])
        return parser
    response.raise_for_status()
    parser = RobotFileParser()
    parser.set_url(url)
    parser.parse(response.text.splitlines())
    return parser


def fetch(session: requests.Session, robots: RobotFileParser, url: str, delay: float):
    if not robots.can_fetch(USER_AGENT, url):
        raise PermissionError(f"robots.txt disallows {url}")
    time.sleep(delay)
    response = session.get(url, timeout=45, allow_redirects=False)
    if 300 <= response.status_code < 400:
        target = same_origin_url(response.headers.get("Location", ""))
        if not target:
            raise PermissionError("Cross-origin or invalid redirect refused")
        response = session.get(target, timeout=45, allow_redirects=False)
        if 300 <= response.status_code < 400:
            raise PermissionError("Redirect chain refused; manual source validation required")
    if response.status_code in (401, 403, 429):
        raise PermissionError(f"Source refused access (HTTP {response.status_code}); stopping without retry")
    response.raise_for_status()
    return response


def sitemap_urls(session, robots, delay):
    robots_url = urljoin(BASE, "robots.txt")
    response = session.get(robots_url, timeout=30)
    declared = []
    if response.status_code == 200:
        for line in response.text.splitlines():
            if line.lower().startswith("sitemap:"):
                declared.append(line.split(":", 1)[1].strip())
    if not declared:
        declared = [urljoin(BASE, "sitemap.xml")]
    found, pending, seen = [], list(declared), set()
    while pending and len(seen) < 20:
        url = pending.pop(0)
        if url in seen:
            continue
        safe = same_origin_url(url)
        if not safe:
            continue
        seen.add(safe)
        try:
            page = fetch(session, robots, safe, delay)
        except requests.HTTPError as exc:
            if getattr(exc.response, "status_code", None) == 404:
                continue
            raise
        root = ET.fromstring(page.content)
        for node in root.iter():
            if node.tag.rsplit("}", 1)[-1].lower() != "loc" or not node.text:
                continue
            loc = node.text.strip()
            judgment = canonical_judgment_url(loc)
            if judgment:
                found.append(judgment)
            elif loc.lower().endswith(".xml"):
                child = same_origin_url(loc)
                if child and child not in seen:
                    pending.append(child)
    return list(dict.fromkeys(found))


def discover(session, robots, delay):
    home = fetch(session, robots, BASE, delay)
    parser = PageLinks()
    parser.feed(home.text)
    records, listing_pages = [], []
    for href in parser.links:
        judgment = canonical_judgment_url(href)
        if judgment:
            records.append(judgment)
        else:
            safe = same_origin_url(href)
            if safe and safe != BASE and any(token in urlparse(safe).path.lower() for token in ("search", "page", "archive", "index", "list")):
                listing_pages.append(safe)
    # Public sitemap is the preferred bulk index. Homepage links remain a fallback.
    sitemap = sitemap_urls(session, robots, delay)
    records.extend(sitemap)
    for page_url in list(dict.fromkeys(listing_pages))[:20]:
        page = fetch(session, robots, page_url, delay)
        links = PageLinks()
        links.feed(page.text)
        records.extend(filter(None, (canonical_judgment_url(x) for x in links.links)))
    return list(dict.fromkeys(records))


def sql_quote(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def make_statements(record):
    parsed = parse_judgment(record["html"], record["url"])
    meta = parsed["metadata"]
    body = parsed["articles"][0]["body"]
    if len(body) > 100000:
        raise ValueError("judgment text exceeds the 100,000-character import limit")
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    source_id = meta["source_id"]
    metadata_json = json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
    title = parsed["title"][:240]
    document_type = parsed["lawType"]
    source_url = record["url"]
    authority = parsed["issuingAuthority"]
    number = meta["judgment_number"]
    date = meta["judgment_date"]
    notes = "ورود خودکار از صفحه عمومی سامانه ملی آرای قضایی؛ وضعیت needs_review؛ نوع و مرجع صادرکننده موقت و نیازمند مقابله انسانی."
    slug = parsed["slug"]

    law_sql = """INSERT OR IGNORE INTO legal_laws
      (slug,title,law_type,issuing_authority,approved_date,status,source_name,source_url,notes,
       document_number,document_date,subject,official_source_url,discovery_source_url,content_sha256,source_checked_at)
      VALUES (?1,?2,?3,?4,NULL,'needs_review',?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL);"""
    law_params = [slug, title, document_type, authority, meta["source"], source_url, notes,
                  number, date, meta.get("summary"), source_url, source_url, digest]
    article_payload = json.dumps([{"number": "متن کامل", "heading": title, "body": body}], ensure_ascii=False, separators=(",", ":"))
    article_sql = """INSERT OR IGNORE INTO legal_articles (law_id,article_number,heading,body,status)
      SELECT l.id,json_extract(j.value,'$.number'),json_extract(j.value,'$.heading'),json_extract(j.value,'$.body'),'needs_review'
      FROM legal_laws l,json_each(?1) j WHERE l.slug=?2;"""
    index_sql = """INSERT OR IGNORE INTO legal_document_index
      (source_key,source_id,title,document_type,document_number,document_date,issuing_authority,subject,
       source_url,discovery_source_url,content_sha256,metadata_json)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12);"""
    index_params = [SOURCE_KEY, source_id, title, document_type, number, date, authority,
                    meta.get("summary"), source_url, BASE, digest, metadata_json]
    return [
        {"sql": law_sql, "params": law_params},
        {"sql": article_sql, "params": [article_payload, slug]},
        {"sql": index_sql, "params": index_params},
    ], {"sourceId": source_id, "title": title, "type": document_type, "sha256": digest}

def d1_request(session, sqls):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{DB_ID}/query"
    statements = sqls
    response = session.post(endpoint, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                            json={"batch": statements}, timeout=180)
    response.raise_for_status()
    result = response.json()
    if not result.get("success") or any(not x.get("success", True) for x in result.get("result", [])):
        raise RuntimeError("D1 rejected an import batch: " + json.dumps(result.get("errors", []), ensure_ascii=False)[:1000])


def read_cursor(session):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{DB_ID}/query"
    response = session.post(endpoint, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                            json={"sql": "SELECT last_cursor FROM legal_document_sources WHERE source_key=?1", "params": [SOURCE_KEY]}, timeout=60)
    response.raise_for_status()
    data = response.json()
    return (data.get("result") or [{}])[0].get("results", [{}])[0].get("last_cursor")


def write_cursor(session, cursor, error=None):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{DB_ID}/query"
    response = session.post(endpoint, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                            json={"sql": "UPDATE legal_document_sources SET last_cursor=?1,last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_success_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=?2,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE source_key=?3",
                                  "params": [cursor, error, SOURCE_KEY]}, timeout=60)
    response.raise_for_status()
    if not response.json().get("success"):
        raise RuntimeError("Could not persist crawler cursor")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--max-pages", type=int, default=250)
    cli.add_argument("--delay", type=float, default=2.0)
    cli.add_argument("--dry-run", action="store_true")
    cli.add_argument("--output", default="artifacts/national-judgments-report.json")
    args = cli.parse_args()
    if not 1 <= args.max_pages <= 1500 or not 1 <= args.delay <= 30:
        raise SystemExit("max-pages must be 1..1500 and delay must be 1..30 seconds")

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"})
    robots = robots_policy(session)
    urls = discover(session, robots, args.delay)
    if not urls:
        raise SystemExit("No canonical public judgment links were discovered; no records imported.")

    cursor = None if args.dry_run else read_cursor(session)
    start = 0
    if cursor and cursor in urls:
        start = urls.index(cursor) + 1
    # Recheck the newest 50 every run for newly published records; then continue bulk cursor.
    recent = urls[:min(50, len(urls))]
    bulk = urls[start:]
    selected = list(dict.fromkeys(recent + bulk))[:args.max_pages]
    report = {"source": BASE, "discovered": len(urls), "selected": len(selected), "imported": 0,
              "failed": 0, "skipped": 0, "status": "needs_review", "records": [], "errors": []}
    statements = []
    last_cursor = cursor
    for url in selected:
        try:
            page = fetch(session, robots, url, args.delay)
            sqls, summary = make_statements({"url": url, "html": page.text})
            report["records"].append(summary)
            report["imported"] += 1
            last_cursor = url
            if not args.dry_run:
                statements.extend(sqls)
                if len(statements) >= 90:
                    d1_request(session, statements)
                    statements = []
        except PermissionError as exc:
            report["failed"] += 1
            report["errors"].append({"url": url, "error": str(exc)})
            break
        except Exception as exc:
            report["failed"] += 1
            report["errors"].append({"url": url, "error": f"{type(exc).__name__}: {str(exc)[:300]}"})
            # A malformed individual page does not block later public records.
            continue
    if not args.dry_run and statements:
        d1_request(session, statements)
    if not args.dry_run and last_cursor:
        write_cursor(session, last_cursor, report["errors"][0]["error"] if report["errors"] else None)
    report["remaining_estimate"] = max(0, len(urls) - (urls.index(last_cursor) + 1 if last_cursor in urls else 0))
    report["cursor"] = last_cursor
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({k: v for k, v in report.items() if k != "records"}, ensure_ascii=False))
    if report["failed"] and not report["imported"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
