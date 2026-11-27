#!/usr/bin/env python3
"""Read-only probe of the official DOTIC public catalogue.

The probe checks robots.txt before inspecting the public search/detail pages.
It never solves challenges, uses proxies, submits forms, or bulk-crawls records.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
from html.parser import HTMLParser

import requests

BASE = "https://dotic.ir"
SEARCH_URL = BASE + "/new-search/"
SAMPLE_URL = BASE + "/news/21912"
USER_AGENT = "MokhtariLawAcademyBot/1.0 (+https://mokhtari.ir; mailto:edu@mokhtari.ir)"
TIMEOUT = 25


def _integer(value: str | None):
    if not value:
        return None
    return int(re.sub(r"[^\d]", "", value))


def check_robots(response, target_url: str, user_agent: str = USER_AGENT) -> dict:
    status = int(response.status_code)
    if status in (404, 410):
        return {"status_code": status, "available": False, "allowed": True,
                "reason": "robots_not_found_no_published_rules"}
    if status != 200:
        return {"status_code": status, "available": False, "allowed": False,
                "reason": "robots_unavailable_fail_closed"}
    parser = RobotFileParser()
    parser.set_url(BASE + "/robots.txt")
    parser.parse(response.text.splitlines())
    allowed = parser.can_fetch(user_agent, target_url)
    return {"status_code": status, "available": True, "allowed": allowed,
            "reason": "allowed_by_robots" if allowed else "disallowed_by_robots"}


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title_parts = []
        self.heading_parts = []
        self.text_parts = []
        self.anchors = []
        self.media = []
        self.in_title = False
        self.in_heading = False
        self.current_anchor = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag in ("h1", "h2", "h3") and not self.heading_parts:
            self.in_heading = True
        if tag == "a":
            self.current_anchor = {"href": attrs.get("href", ""), "text": ""}
        if tag in ("iframe", "embed") and attrs.get("src"):
            self.media.append(attrs["src"])
        if tag == "object" and attrs.get("data"):
            self.media.append(attrs["data"])

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in ("h1", "h2", "h3"):
            self.in_heading = False
        if tag == "a" and self.current_anchor is not None:
            self.anchors.append(self.current_anchor)
            self.current_anchor = None

    def handle_data(self, data):
        if not data:
            return
        self.text_parts.append(data)
        if self.in_title:
            self.title_parts.append(data)
        if self.in_heading:
            self.heading_parts.append(data)
        if self.current_anchor is not None:
            self.current_anchor["text"] += data

    def parse(self, html):
        self.feed(html)
        return self


def parse_search_page(html: str, page_url: str = SEARCH_URL) -> dict:
    page = _PageParser().parse(html)
    text = " ".join(" ".join(page.text_parts).split())
    match = re.search(r"(\d[\d,]*)\s*-\s*(\d[\d,]*)\s+of\s+([\d,]+)", text, re.I)
    first = _integer(match.group(1)) if match else None
    last = _integer(match.group(2)) if match else None
    total = _integer(match.group(3)) if match else None
    page_size = (last - first + 1) if first is not None and last is not None else None
    page_count = math.ceil(total / page_size) if total and page_size else None
    urls = []
    for anchor in page.anchors:
        href = urljoin(page_url, anchor.get("href", ""))
        path = urlparse(href).path
        if re.fullmatch(r"/news/\d+/?", path) and href not in urls:
            urls.append(href)
    return {
        "result_total": total,
        "page_first": first,
        "page_last": last,
        "page_size": page_size,
        "page_count": page_count,
        "sample_record_urls": urls[:15],
        "page_title": " ".join(page.title_parts).strip() or None,
    }


def parse_detail_page(html: str, page_url: str = SAMPLE_URL) -> dict:
    page = _PageParser().parse(html)
    title = " ".join(page.heading_parts).strip() or " ".join(page.title_parts).strip() or None
    text = " ".join(" ".join(page.text_parts).split())
    date_match = re.search(r"تاریخ خبر\s*:\s*([^|]{5,50})", text)
    number_match = re.search(r"شماره\s+([0-9۰-۹٠-٩/.-]{2,40})", text)
    candidates = []
    for tag in page.anchors:
        href = tag.get("href")
        if not href:
            continue
        absolute = urljoin(page_url, href)
        hint = (href + " " + tag.get("text", "")).lower()
        if ".pdf" in hint or "download" in hint or "file" in hint or "دریافت متن کامل" in hint:
            if absolute not in candidates:
                candidates.append(absolute)
    for href in page.media:
        absolute = urljoin(page_url, href)
        if absolute not in candidates:
            candidates.append(absolute)
    for raw in re.findall(r"""(?:https?:)?//[^"'<> ]+|/[^"'<> ]+""", html):
        if ".pdf" in raw.lower():
            absolute = urljoin(page_url, raw)
            if absolute not in candidates:
                candidates.append(absolute)
    return {
        "title": title,
        "published_date_text": date_match.group(1).strip() if date_match else None,
        "document_number_candidate": number_match.group(1) if number_match else None,
        "pdf_candidates": candidates[:20],
        "has_pdf_candidate": bool(candidates),
        "page_url": page_url,
    }


def run_probe(session: requests.Session | None = None) -> dict:
    session = session or requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "source": "پایگاه ملی اطلاع‌رسانی قوانین و مقررات کشور (DOTIC)",
        "base_url": BASE,
        "status": "unknown",
        "robots": {},
        "search": {},
        "sample_detail": {},
        "errors": [],
        "crawl_policy": "No crawling unless robots.txt explicitly permits the public search and record paths.",
    }
    try:
        robots_response = session.get(BASE + "/robots.txt", timeout=TIMEOUT, allow_redirects=True)
        search_robots = check_robots(robots_response, SEARCH_URL)
        detail_robots = check_robots(robots_response, SAMPLE_URL)
        report["robots"] = {
            "status_code": robots_response.status_code,
            "search_allowed": search_robots["allowed"],
            "search_reason": search_robots["reason"],
            "detail_allowed": detail_robots["allowed"],
            "detail_reason": detail_robots["reason"],
            "body_excerpt": robots_response.text[:2500] if robots_response.status_code == 200 else None,
        }
        if not search_robots["allowed"] or not detail_robots["allowed"]:
            report["status"] = "robots_disallowed_or_unavailable"
            return report
        search_response = session.get(SEARCH_URL, timeout=TIMEOUT, allow_redirects=True)
        report["search_http_status"] = search_response.status_code
        if search_response.status_code != 200:
            report["status"] = "search_unavailable"
            report["errors"].append(f"Search returned HTTP {search_response.status_code}")
            return report
        lower = search_response.text.lower()
        if any(marker in lower for marker in ("captcha", "challenge-platform", "cf-chl-", "access denied")):
            report["status"] = "challenge_or_access_denied"
            return report
        report["search"] = parse_search_page(search_response.text, search_response.url)
        sample_urls = report["search"].get("sample_record_urls") or []
        sample_url = next((u for u in sample_urls if u.endswith("/21912")), SAMPLE_URL)
        detail_response = session.get(sample_url, timeout=TIMEOUT, allow_redirects=True)
        report["sample_detail_http_status"] = detail_response.status_code
        if detail_response.status_code == 200:
            report["sample_detail"] = parse_detail_page(detail_response.text, detail_response.url)
        report["status"] = "accessible"
        report["crawl_allowed"] = True
    except requests.RequestException as exc:
        report["status"] = "network_error"
        report["errors"].append(type(exc).__name__ + ": " + str(exc)[:400])
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="artifacts/dotic-public-probe.json")
    args = parser.parse_args()
    report = run_probe()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
