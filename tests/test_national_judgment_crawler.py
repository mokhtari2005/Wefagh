import unittest
from scripts.crawl_national_judgments import canonical_judgment_url, same_origin_url, make_statements

class NationalJudgmentCrawlerTests(unittest.TestCase):
    def test_canonical_record_url(self):
        self.assertEqual(canonical_judgment_url("/Judge/Text/42028"), "https://ara.jri.ac.ir/Judge/Text/42028")
        self.assertIsNone(canonical_judgment_url("https://evil.example/Judge/Text/42028"))
        self.assertIsNone(canonical_judgment_url("/Judge/Text/abc"))


    def test_imported_judgment_is_not_marked_source_checked_before_human_review(self):
        html = """
        <html><body>
        <h1>عنوان: رأی دادگاه</h1>
        <p>پیام: نمونه برای بررسی انسانی</p>
        <p>شماره دادنامه قطعی: ۹۰۰۹۸۲۱۱۵۲۹۰۰۷۹۷</p>
        <p>تاریخ دادنامه قطعی: ۱۳۹۵/۰۵/۱۸</p>
        <p>گروه رأی: حقوقی</p>
        <h2>رأی خلاصه جریان پرونده</h2>
        <p>محتویات پرونده حاکیست این متن نمونه برای آزمون مسیر ورود رأی قضایی است و باید پیش از تأیید با متن رسمی تطبیق داده شود.</p>
        </body></html>
        """
        statements, _ = make_statements({
            "url": "https://ara.jri.ac.ir/Judge/Text/34496",
            "html": html,
        })
        sql = statements[0]["sql"]
        self.assertIn("content_sha256,source_checked_at)", sql)
        self.assertIn("NULL);", sql)
        self.assertIn("'needs_review'", sql)

    def test_same_origin_listing_url(self):
        self.assertEqual(same_origin_url("/"), "https://ara.jri.ac.ir/")
        self.assertIsNone(same_origin_url("https://evil.example/page"))
        self.assertIsNone(same_origin_url("http://ara.jri.ac.ir/"))

if __name__ == "__main__":
    unittest.main()
