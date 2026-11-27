#!/usr/bin/env python3
"""One-request public Qavanin access probe. Never solves challenges or retries blocked access."""
from __future__ import annotations

import json
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.robotparser import RobotFileParser

import requests

BASE = "https://qavanin.ir/"
USER_AGENT = "MokhtariLawAcademyLegalBankBot/1.0 (+https://mokhtari.ir; edu@mokhtari.ir)"
DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


class ResultLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.page_options = 0
        self.in_page_select = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "select" and attrs.get("id", "").lower() == "pagenumber":
            self.in_page_select = True
        if tag.lower() == "option" and self.in_page_select:
            self.page_options += 1
        if tag.lower() == "a":
            href = attrs.get("href", "")
            match = re.search(r"(?:\?|&)IDS=(\d+)", href, re.I)
            if match:
                self.ids.add(match.group(1))

    def handle_endtag(self, tag):
        if tag.lower() == "select":
            self.in_page_select = False


def probe():
    report = {"source": BASE, "user_agent": USER_AGENT, "status": "not_checked"}
    try:
        robots_response = requests.get(BASE + "robots.txt", headers={"User-Agent": USER_AGENT},
                                       timeout=20, allow_redirects=False)
        if 300 <= robots_response.status_code < 400:
            report.update(status="blocked", reason="robots_redirect")
            return report
        if robots_response.status_code in (401, 403, 429):
            report.update(status="blocked", reason="robots_http_" + str(robots_response.status_code))
            return report
        report["robots_status"] = robots_response.status_code
        if robots_response.status_code not in (200, 404):
            report.update(status="blocked", reason="robots_http_" + str(robots_response.status_code))
            return report
        if robots_response.status_code == 200:
            robots = RobotFileParser()
            robots.set_url(BASE + "robots.txt")
            robots.parse(robots_response.text.splitlines())
            if not robots.can_fetch(USER_AGENT, BASE):
                report.update(status="disallowed_by_robots")
                return report

        # Start with the same small, unfiltered request used by the public search client.
        params = {"size": "25"}
        url = BASE + "?" + urlencode(params)
        response = requests.get(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.5",
        }, timeout=30, allow_redirects=False)
        report["http_status"] = response.status_code
        report["checked_url"] = url
        if 300 <= response.status_code < 400 or response.status_code in (401, 403, 429):
            report.update(status="blocked", reason="search_http_" + str(response.status_code))
            return report
        response.raise_for_status()
        html = response.text
        lowered = html.lower()
        challenge_markers = ("cf-chl-", "challenge-platform", "captcha", "verify you are human", "access denied", "transferring to the website", "value_v1", "function values()", "error-section__title")
        if any(marker in lowered for marker in challenge_markers):
            report.update(status="blocked", reason="challenge_page_detected")
            return report

        plain = re.sub(r"<[^>]+>", " ", html)
        plain = re.sub(r"\s+", " ", plain).translate(DIGITS)
        count = re.search(r"(?:تعداد\s*یافته\s*ها|تعداد\s*یافته‌ها|تعداد\s*نتایج)\s*[:：]?\s*([0-9,٬]+)", plain)
        parser = ResultLinks()
        parser.feed(html)
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        report.update(
            status="accessible" if parser.ids or count else "accessible_unparsed",
            result_count=int(re.sub(r"[,٬]", "", count.group(1))) if count else None,
            first_page_ids=len(parser.ids),
            page_selector_options=parser.page_options,
            page_title=re.sub(r"\s+", " ", title_match.group(1)).strip()[:200] if title_match else None,
            has_result_count_marker="تعداد یافته ها" in html,
            body_preview=plain[:1200],
            content_type=response.headers.get("Content-Type"),
            content_length=response.headers.get("Content-Length"),
        )
        return report
    except requests.RequestException as exc:
        report.update(status="network_error", reason=type(exc).__name__ + ": " + str(exc)[:400])
        return report
    except Exception as exc:
        report.update(status="probe_error", reason=type(exc).__name__ + ": " + str(exc)[:400])
        return report


def main():
    report = probe()
    Path("artifacts").mkdir(exist_ok=True)
    Path("artifacts/qavanin-public-access-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
