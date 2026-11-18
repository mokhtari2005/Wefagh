#!/usr/bin/env python3
"""Parse one publicly accessible National Judicial Decisions Portal judgment page.

This tool is deliberately offline: it does not crawl, authenticate, bypass controls,
or make network requests. Supply a saved HTML page and its canonical source URL.
"""
from __future__ import annotations

import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


class VisibleText(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "form"}
    BLOCK = {"p", "div", "section", "article", "h1", "h2", "h3", "li", "br", "tr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip_depth += 1
        elif not self.skip_depth and tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
        elif not self.skip_depth and tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip_depth and data.strip():
            self.parts.append(data.strip())


def normalize(value: str) -> str:
    value = value.translate(PERSIAN_DIGITS).replace("\u200c", "‌")
    value = re.sub(r"[ \t\xa0]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def field(text: str, labels: str) -> str | None:
    """Read a labelled value on the same or immediately following visible line."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    label_re = re.compile(rf"^(?:{labels})\s*[:：]?\s*(.*)$", re.I)
    for index, line in enumerate(lines):
        match = label_re.search(line)
        if not match:
            continue
        value = match.group(1).strip(" :：*")
        if value:
            return value
        if index + 1 < len(lines):
            candidate = lines[index + 1].strip(" :：*")
            # Do not mistake the next labelled metadata field for this value.
            if candidate and not re.match(r"^(?:عنوان|پیام|شماره|تاریخ|گروه|پرونده)\b", candidate):
                return candidate
    # Some pages embed labels in a longer paragraph (e.g. "پرونده ... شماره ...").
    match = re.search(rf"(?:{labels})\s*[:：]?\s*([^\n]+)", text, re.I)
    if match:
        value = match.group(1).strip(" :：*")
        return value or None
    return None


def classify(title: str, group: str | None) -> str:
    # Classification must rely on explicit record metadata, not incidental
    # references inside the reasoning/body of an ordinary judgment.
    value = normalize(" ".join(part for part in (title, group or "") if part)).replace("ي", "ی")
    if "رأی وحدت رویه" in value or "رای وحدت رویه" in value:
        return "supreme_court_unified_precedent"
    if "رأی اصراری" in value or "رای اصراری" in value:
        return "supreme_court_insistence_precedent"
    if "هیئت عمومی دیوان عدالت اداری" in value:
        return "administrative_court_general_board"
    if "هیئت تخصصی دیوان عدالت اداری" in value:
        return "administrative_court_specialized_board"
    return "judicial_decision"


def parse_judgment(html: str, source_url: str) -> dict:
    parsed_url = urlparse(source_url)
    match = re.fullmatch(r"/Judge/Text/(\d+)/?", parsed_url.path, re.I)
    if parsed_url.scheme != "https" or parsed_url.netloc.lower() not in {"ara.jri.ac.ir", "www.ara.jri.ac.ir"} or not match:
        raise ValueError("source_url must be a canonical ara.jri.ac.ir/Judge/Text/<id> URL")

    parser = VisibleText()
    parser.feed(html)
    text = normalize("".join(parser.parts))

    title = field(text, r"عنوان")
    if not title:
        # Current public pages can expose only a heading such as «رأی دادگاه بدوی».
        headings = [line for line in text.splitlines() if re.match(r"^(?:رأی|رای)\s+", line)]
        title = headings[0] if headings else None
    if not title:
        raise ValueError("judgment title or heading not found")

    summary = field(text, r"پیام")
    number = field(text, r"شماره\s+دادنامه\s+قطعی|شماره\s+دادنامه|شماره\s+نهایی")
    date = field(text, r"تاریخ\s+دادنامه\s+قطعی|تاریخ\s+دادنامه")
    group = field(text, r"گروه\s+رأی|گروه\s+رای")

    start = re.search(
        r"(?:رأی|رای)\s+(?:خلاصه\s+جریان\s+پرونده|دادگاه\s+(?:بدوی|تجدیدنظر)|شعبه(?:\s+[^\n]+)?|هیئت\s+عمومی)",
        text,
    )
    if not start:
        start = re.search(r"(?:متن\s+رأی|متن\s+رای)", text)
    if not start:
        raise ValueError("judgment text section not found")

    body_start = start.end()
    # On current pages, case metadata and parties precede the actual «رأی دادگاه» paragraph.
    decision_marker = re.search(r"(?:رأی|رای)\s+دادگاه\b", text[body_start:], re.I)
    if decision_marker:
        body_start += decision_marker.end()
    remainder = text[body_start:]
    end = re.search(r"نقد رأی|نقد رای|آراء منتخب پرونده|تماس با ما|کلیه حقوق برای پژوهشگاه", remainder)
    full_text = remainder[:end.start() if end else len(remainder)].strip()
    if len(full_text) < 100:
        raise ValueError("judgment text is unexpectedly short")

    source_id = match.group(1)
    metadata = {
        "source": "سامانه ملی آرای قضایی پژوهشگاه قوه قضائیه",
        "source_id": source_id,
        "judgment_number": number.translate(PERSIAN_DIGITS) if number else None,
        "judgment_date": date.translate(PERSIAN_DIGITS) if date else None,
        "summary": summary,
        "group": group,
        "classification_is_provisional": True,
        "missing_metadata": [name for name, value in (("judgment_number", number), ("judgment_date", date)) if not value],
    }
    return {
        "slug": f"ara-jri-{source_id}",
        "title": title[:240],
        "lawType": classify(title, group),
        "issuingAuthority": "مرجع مندرج در متن رأی؛ نیازمند تطبیق",
        "approvedDate": metadata["judgment_date"],
        "sourceName": metadata["source"],
        "sourceUrl": source_url,
        "notes": json.dumps(metadata, ensure_ascii=False),
        "articles": [{"number": "متن کامل", "heading": title[:240], "body": full_text}],
        "status": "needs_review",
        "metadata": metadata,
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--html", required=True, help="Path to a saved HTML judgment page")
    cli.add_argument("--url", required=True, help="Canonical source URL for that page")
    cli.add_argument("--output", help="Output JSON path; defaults to stdout")
    args = cli.parse_args()
    result = parse_judgment(Path(args.html).read_text(encoding="utf-8"), args.url)
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
