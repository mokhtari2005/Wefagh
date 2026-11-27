#!/usr/bin/env python3
"""Import the public Iran-law GraphRAG snapshot as unverified legal records.

The dataset is a research packaging of the upstream DOTIC-derived corpus.
Every imported document/article stays needs_review; source URLs and snapshot
provenance are retained. Changed existing records are queued, never overwritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import quote, urlparse

import requests

REPO = "justicedao/ipfs_iran_laws_ir"
DATASET_URL = "https://huggingface.co/datasets/" + REPO
REVISION_API = "https://huggingface.co/api/datasets/" + REPO + "/revision/main"
TREE_API = "https://huggingface.co/api/datasets/" + REPO + "/tree/{revision}/data/corpus?recursive=true"
DB_ID = "a02aeb28-b6e7-4423-9671-1ce3f9e3038b"
SOURCE_KEY = "iran-laws-graphrag"
SOURCE_NAME = "پیکره پژوهشی قوانین ایران (برگرفته از DOTIC)"
TRUSTED_HOSTS = {"dotic.ir", "www.dotic.ir", "media.dotic.ir", "qavanin.ir", "www.qavanin.ir", "rrk.ir", "www.rrk.ir"}
PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def text(value):
    return str(value or "").strip()


def normalize_url(value):
    value = text(value)
    if not value:
        return None
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if host in TRUSTED_HOSTS and parsed.scheme == "http":
        value = "https://" + parsed.netloc + parsed.path
        if parsed.query:
            value += "?" + parsed.query
        if parsed.fragment:
            value += "#" + parsed.fragment
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"https"} or not host:
        return None
    return value


def classify_title(title):
    value = text(title).replace("ي", "ی").replace("ك", "ک")
    compact = re.sub(r"[\s\u200c]+", "", value)
    # A statute remains a law even when its title mentions an implementing bylaw.
    if "استفتاء" in value or "استفتا" in value or "مسئله فقهی" in value or "فتوای" in value:
        return "fatwa"
    if "قانون تفسیری" in value or "قانون تفسیر" in value or "استفساریه" in value:
        return "interpretive_law"
    if "مجمع تشخیص مصلحت" in value and ("مصوبه" in value or "مصلحت نظام" in value):
        return "expediency_council_resolution"
    if value.startswith("قانون") or value.startswith("قوانین"):
        return "law"
    if value.startswith("طرح") or value.startswith("لایحه"):
        return "bill"
    if "سیاستهای کلی" in compact:
        return "general_policies"
    if "آیین نامه" in value or "آیین‌نامه" in value or "آئین نامه" in value:
        return "bylaw"
    if "تصویب نامه" in value or "تصویب‌نامه" in value:
        return "executive_regulation"
    if "بخشنامه" in value or "دستورالعمل" in value:
        return "executive_circular"
    if "مصوبه" in value:
        return "executive_resolution"
    if "کنوانسیون" in value or "معاهده" in value or "موافقتنامه" in value:
        return "treaty"
    return "other"

def stable_law_key(row):
    return text(row.get("law_cid") or row.get("instrument_id") or row.get("entry_cid") or row.get("source_url") or row.get("instrument_title") or row.get("title"))


def build_documents(rows, revision):
    docs = {}
    for row in rows:
        kind = text(row.get("record_type")).lower()
        key = stable_law_key(row)
        if not key:
            continue
        title = text(row.get("instrument_title") or row.get("law_title") or (row.get("title") if kind == "law" else ""))
        doc = docs.setdefault(key, {
            "key": key, "title": title, "source_url": None, "official_source_url": None,
            "law_type": None, "articles": [], "law_body": "", "metadata": {},
        })
        if title and (not doc["title"] or kind == "law"):
            doc["title"] = title
        source_url = normalize_url(row.get("source_url"))
        if source_url and not doc["source_url"]:
            doc["source_url"] = source_url
        if source_url and urlparse(source_url).hostname in TRUSTED_HOSTS:
            doc["official_source_url"] = source_url
        for field in ("authority", "coverage", "license", "collector", "source_dataset", "source_revision", "snapshot_date"):
            value = text(row.get(field))
            if value:
                doc["metadata"][field] = value
        if kind == "law":
            doc["law_body"] = text(row.get("body"))
            doc["metadata"]["record_type"] = "law"
        elif kind in {"article", "section"}:
            body = text(row.get("body"))
            if not body:
                continue
            number = text(row.get("article_number") or row.get("section_number") or row.get("article_title") or row.get("title"))
            heading = text(row.get("article_title") or row.get("title") or number)
            entry = text(row.get("entry_cid"))
            doc["articles"].append({
                "number": number or ("بخش " + str(len(doc["articles"]) + 1)),
                "heading": heading[:240],
                "body": body[:100000],
                "entry": entry,
            })
    result = []
    for key, doc in docs.items():
        title = doc["title"] or "سند حقوقی بدون عنوان"
        doc["law_type"] = classify_title(title)
        if not doc["articles"] and doc["law_body"]:
            doc["articles"] = [{"number": "متن کامل", "heading": title[:240], "body": doc["law_body"][:100000], "entry": ""}]
        seen_numbers = set()
        clean_articles = []
        seen_bodies = set()
        for article in doc["articles"]:
            body = article["body"]
            digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
            if digest in seen_bodies:
                continue
            seen_bodies.add(digest)
            base_number = article["number"] or ("بخش " + str(len(clean_articles) + 1))
            candidate = base_number[:120]
            if candidate in seen_numbers:
                suffix = digest[:10]
                candidate = base_number[:107] + " / " + suffix
                counter = 1
                while candidate in seen_numbers:
                    suffix = digest[:7] + "-" + str(counter)
                    candidate = base_number[:120 - len(suffix) - 3] + " / " + suffix
                    counter += 1
            seen_numbers.add(candidate)
            clean_articles.append({"number": candidate, "heading": article["heading"], "body": body})
        doc["articles"] = clean_articles
        source = doc["source_url"] or DATASET_URL
        doc["slug"] = "iran-ir-" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
        doc["source_url"] = source
        doc["content_sha256"] = hashlib.sha256(
            (title + "\n" + "\n".join(a["number"] + "\n" + a["body"] for a in clean_articles)).encode("utf-8")
        ).hexdigest()
        doc["notes"] = (
            "ورود از پیکره پژوهشی " + REPO + "؛ نسخه منبع " + revision +
            "؛ داده بالادستی مبتنی بر DOTIC؛ نوع مرجع و تنقیح متن نیازمند مقابله با منبع رسمی؛ وضعیت اولیه needs_review. "
            + json.dumps(doc["metadata"], ensure_ascii=False, separators=(",", ":"))
        )[:5000]
        result.append(doc)
    return result


def get_revision(session):
    response = session.get(REVISION_API, timeout=45)
    response.raise_for_status()
    payload = response.json()
    revision = payload.get("sha")
    if not revision:
        raise RuntimeError("Hugging Face revision response did not contain a commit SHA")
    return revision


def get_parquet_files(session, revision):
    url = TREE_API.format(revision=revision)
    response = session.get(url, timeout=45)
    response.raise_for_status()
    rows = response.json()
    files = sorted(
        item["path"] for item in rows
        if item.get("type") == "file"
        and item.get("path", "").startswith("data/corpus/")
        and item.get("path", "").endswith(".parquet")
    )
    if not files:
        raise RuntimeError("No public corpus Parquet shards were found in the dataset revision")
    return files


def download_shard(session, revision, path, target):
    url = DATASET_URL + "/resolve/" + revision + "/" + quote(path, safe="/") + "?download=true"
    with session.get(url, stream=True, timeout=(30, 240)) as response:
        response.raise_for_status()
        with open(target, "wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    output.write(chunk)


def read_cursor(session):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    endpoint = "https://api.cloudflare.com/client/v4/accounts/" + account + "/d1/database/" + DB_ID + "/query"
    response = session.post(endpoint, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
                            json={"sql": "SELECT last_cursor FROM legal_document_sources WHERE source_key=?1", "params": [SOURCE_KEY]}, timeout=60)
    response.raise_for_status()
    data = response.json()
    return (data.get("result") or [{}])[0].get("results", [{}])[0].get("last_cursor")


def d1_batch(session, statements):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    endpoint = "https://api.cloudflare.com/client/v4/accounts/" + account + "/d1/database/" + DB_ID + "/query"
    response = session.post(endpoint, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
                            json={"batch": statements}, timeout=180)
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success") or any(not item.get("success", True) for item in payload.get("result", [])):
        raise RuntimeError("D1 rejected a legal corpus batch: " + json.dumps(payload.get("errors", []), ensure_ascii=False)[:1200])
    return sum(int((item.get("meta") or {}).get("changes", 0)) for item in payload.get("result", []))


def send_statements(session, statements, report, key):
    total = 0
    for start in range(0, len(statements), 80):
        total += d1_batch(session, statements[start:start + 80])
    report[key] += total
    return total


def read_existing(session):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    endpoint = "https://api.cloudflare.com/client/v4/accounts/" + account + "/d1/database/" + DB_ID + "/query"
    response = session.post(endpoint, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
                            json={"sql": "SELECT id,slug,content_sha256,status FROM legal_laws WHERE slug LIKE 'iran-ir-%'", "params": []}, timeout=90)
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError("Could not read existing DOTIC snapshot rows")
    rows = (payload.get("result") or [{}])[0].get("results", [])
    return {row["slug"]: row for row in rows}


def law_statement(doc):
    return {
        "sql": """INSERT OR IGNORE INTO legal_laws
          (slug,title,law_type,issuing_authority,approved_date,status,source_name,source_url,notes,
           document_number,document_date,subject,official_source_url,discovery_source_url,content_sha256,source_checked_at)
          VALUES (?1,?2,?3,NULL,NULL,'needs_review',?4,?5,?6,NULL,NULL,?7,?8,?9,?10,NULL);""",
        "params": [doc["slug"], doc["title"][:240], doc["law_type"], SOURCE_NAME, doc["source_url"],
                   doc["notes"], None, doc["official_source_url"], DATASET_URL, doc["content_sha256"]],
    }


def article_statement(payload):
    return {
        "sql": """INSERT OR IGNORE INTO legal_articles (law_id,article_number,heading,body,status)
          SELECT l.id,json_extract(j.value,'$.number'),json_extract(j.value,'$.heading'),
                 json_extract(j.value,'$.body'),'needs_review'
          FROM json_each(?1) j JOIN legal_laws l ON l.slug=json_extract(j.value,'$.slug');""",
        "params": [json.dumps(payload, ensure_ascii=False, separators=(",", ":"))],
    }


def queue_statement(existing, doc):
    payload = {
        "title": doc["title"], "lawType": doc["law_type"], "sourceName": SOURCE_NAME,
        "sourceUrl": doc["source_url"], "officialSourceUrl": doc["official_source_url"],
        "discoverySourceUrl": DATASET_URL, "contentSha256": doc["content_sha256"],
        "notes": doc["notes"], "articles": doc["articles"][:10],
        "proposedArticlesCount": len(doc["articles"]),
        "proposedPayloadTruncated": len(doc["articles"]) > 10,
    }
    return {
        "sql": """INSERT OR IGNORE INTO legal_document_update_queue
          (law_id,slug,title,previous_sha256,proposed_sha256,proposed_payload_json,
           discovery_source_url,official_source_url,review_status)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'needs_review');""",
        "params": [existing["id"], doc["slug"], doc["title"][:240], existing.get("content_sha256"),
                   doc["content_sha256"], json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                   DATASET_URL, doc["official_source_url"]],
    }


def update_source_cursor(session, revision, error=None):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    endpoint = "https://api.cloudflare.com/client/v4/accounts/" + account + "/d1/database/" + DB_ID + "/query"
    if error:
        sql = """UPDATE legal_document_sources SET last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          last_error=?1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE source_key=?2"""
        params = [error[:1000], SOURCE_KEY]
    else:
        sql = """UPDATE legal_document_sources SET last_cursor=?1,last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          last_success_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=NULL,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE source_key=?2"""
        params = [revision, SOURCE_KEY]
    response = session.post(endpoint, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
                            json={"sql": sql, "params": params}, timeout=60)
    response.raise_for_status()
    if not response.json().get("success"):
        raise RuntimeError("Could not update the DOTIC snapshot source cursor")


def run_import(dry_run=False):
    session = requests.Session()
    session.headers.update({"User-Agent": "MokhtariLawAcademyLegalCorpus/1.0 (+https://mokhtari.ir)",
                            "Accept": "application/json,application/octet-stream"})
    report = {
        "source": REPO, "dataset_url": DATASET_URL, "status": "started",
        "documents_discovered": 0, "documents_inserted": 0, "documents_unchanged": 0,
        "documents_changed_queued": 0, "articles_discovered": 0, "articles_inserted": 0,
        "shards": 0, "revision": None, "errors": [],
    }
    try:
        revision = get_revision(session)
        report["revision"] = revision
        if not dry_run:
            previous = read_cursor(session)
            if previous == revision:
                update_source_cursor(session, revision)
                report["status"] = "unchanged_revision"
                return report
        files = get_parquet_files(session, revision)
        report["shards"] = len(files)
        try:
            import pyarrow.parquet as pq
        except ImportError as exc:
            raise RuntimeError("pyarrow is required; install it with pip before running this importer") from exc
        rows = []
        with tempfile.TemporaryDirectory(prefix="iran-laws-") as temp:
            for index, path in enumerate(files):
                local = str(Path(temp) / ("shard-" + str(index) + ".parquet"))
                download_shard(session, revision, path, local)
                parquet = pq.ParquetFile(local)
                for batch in parquet.iter_batches(batch_size=1024):
                    rows.extend(batch.to_pylist())
        report["rows_read"] = len(rows)
        documents = build_documents(rows, revision)
        report["documents_discovered"] = len(documents)
        report["articles_discovered"] = sum(len(doc["articles"]) for doc in documents)
        if dry_run:
            report["status"] = "dry_run"
            return report

        existing = read_existing(session)
        new_docs, changed_docs = [], []
        for doc in documents:
            old = existing.get(doc["slug"])
            if not old:
                new_docs.append(doc)
            elif old.get("content_sha256") == doc["content_sha256"]:
                report["documents_unchanged"] += 1
            else:
                changed_docs.append((old, doc))

        law_statements = [law_statement(doc) for doc in new_docs]
        send_statements(session, law_statements, report, "documents_inserted")

        changed_slugs = {doc["slug"] for _, doc in changed_docs}
        # Re-submit article rows for unchanged parent laws as an idempotent repair pass.
        # D1's unique law_id/article_number index ignores rows already present and accepts missing ones.
        article_docs = [doc for doc in documents if doc["slug"] not in changed_slugs]
        article_payload = []
        article_statements = []
        for doc in article_docs:
            for article in doc["articles"]:
                article_payload.append({
                    "slug": doc["slug"], "number": article["number"],
                    "heading": article["heading"], "body": article["body"],
                })
                if len(json.dumps(article_payload, ensure_ascii=False).encode("utf-8")) >= 48000:
                    article_statements.append(article_statement(article_payload))
                    article_payload = []
        if article_payload:
            article_statements.append(article_statement(article_payload))
        send_statements(session, article_statements, report, "articles_inserted")

        queue = [queue_statement(old, doc) for old, doc in changed_docs]
        send_statements(session, queue, report, "documents_changed_queued")
        report["status"] = "completed"
        update_source_cursor(session, revision)
        return report
    except Exception as exc:
        report["status"] = "failed"
        report["errors"].append(type(exc).__name__ + ": " + str(exc)[:1000])
        try:
            update_source_cursor(session, report.get("revision") or "unknown", report["errors"][0])
        except Exception:
            pass
        raise
    finally:
        Path("artifacts").mkdir(exist_ok=True)
        Path("artifacts/dotic-snapshot-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    report = run_import(dry_run=args.dry_run)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
