import unittest
from scripts.crawl_national_judgments import canonical_judgment_url, same_origin_url

class NationalJudgmentCrawlerTests(unittest.TestCase):
    def test_canonical_record_url(self):
        self.assertEqual(canonical_judgment_url("/Judge/Text/42028"), "https://ara.jri.ac.ir/Judge/Text/42028")
        self.assertIsNone(canonical_judgment_url("https://evil.example/Judge/Text/42028"))
        self.assertIsNone(canonical_judgment_url("/Judge/Text/abc"))

    def test_same_origin_listing_url(self):
        self.assertEqual(same_origin_url("/"), "https://ara.jri.ac.ir/")
        self.assertIsNone(same_origin_url("https://evil.example/page"))
        self.assertIsNone(same_origin_url("http://ara.jri.ac.ir/"))

if __name__ == "__main__":
    unittest.main()
