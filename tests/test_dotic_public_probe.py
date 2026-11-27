import unittest

from scripts.probe_dotic_public import check_robots, parse_detail_page, parse_search_page


class FakeResponse:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


class DoticPublicProbeTests(unittest.TestCase):
    def test_robots_404_is_treated_as_no_published_rules(self):
        result = check_robots(FakeResponse(404), "https://dotic.ir/new-search/")
        self.assertTrue(result["allowed"])
        self.assertEqual(result["reason"], "robots_not_found_no_published_rules")

    def test_robots_disallow_is_respected(self):
        response = FakeResponse(200, "User-agent: *\nDisallow: /new-search/\nAllow: /news/")
        result = check_robots(response, "https://dotic.ir/new-search/")
        self.assertFalse(result["allowed"])
        self.assertEqual(result["reason"], "disallowed_by_robots")

    def test_robots_forbidden_fails_closed(self):
        result = check_robots(FakeResponse(403), "https://dotic.ir/new-search/")
        self.assertFalse(result["allowed"])
        self.assertEqual(result["reason"], "robots_unavailable_fail_closed")

    def test_robots_server_error_fails_closed(self):
        result = check_robots(FakeResponse(503), "https://dotic.ir/new-search/")
        self.assertFalse(result["allowed"])

    def test_search_pagination_total_is_parsed(self):
        html = """
        <html><title>جستجو</title><body>
          <a href="/news/21912">آیین نامه توسعه گردشگری سلامت</a>
          <a href="/news/21913">قانون نمونه</a>
          <div>1 - 15 of 19,691</div>
        </body></html>
        """
        result = parse_search_page(html)
        self.assertEqual(result["result_total"], 19691)
        self.assertEqual(result["page_size"], 15)
        self.assertEqual(result["page_count"], 1313)
        self.assertEqual(result["sample_record_urls"][0], "https://dotic.ir/news/21912")

    def test_detail_page_extracts_title_and_pdf_candidate(self):
        html = """
        <html><head><title>آیین نامه نمونه</title></head><body>
          <h2>آیین نامه نمونه</h2>
          <p>تاریخ خبر: چهارشنبه 13 آبان 1405</p>
          <a href="/files/sample.pdf">دریافت متن کامل</a>
        </body></html>
        """
        result = parse_detail_page(html, "https://dotic.ir/news/21912")
        self.assertEqual(result["title"], "آیین نامه نمونه")
        self.assertTrue(result["has_pdf_candidate"])
        self.assertIn("https://dotic.ir/files/sample.pdf", result["pdf_candidates"])


if __name__ == "__main__":
    unittest.main()
