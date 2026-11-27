import unittest

from scripts.import_iran_graphrag_corpus import build_documents, classify_title, normalize_url, is_d1_daily_write_quota_error


class IranGraphRagCorpusImporterTests(unittest.TestCase):
    def test_d1_free_tier_quota_error_is_recognized(self):
        self.assertTrue(is_d1_daily_write_quota_error(RuntimeError("D1 batch HTTP 400: code 7500 daily row write limit")))
        self.assertTrue(is_d1_daily_write_quota_error(RuntimeError("daily row write limit exceeded")))
        self.assertFalse(is_d1_daily_write_quota_error(RuntimeError("database busy")))

    def test_statute_title_precedes_embedded_bylaw_reference(self):
        self.assertEqual(classify_title("قانون مدنی و آیین‌نامه‌های مرتبط"), "law")
        self.assertEqual(classify_title("آیین‌نامه اجرایی نمونه"), "bylaw")
        self.assertEqual(classify_title("تصویب‌نامه هیئت وزیران"), "executive_regulation")
        self.assertEqual(classify_title("بخشنامه وزارت کشور"), "executive_circular")
        self.assertEqual(classify_title("مصوبه شورای عالی"), "executive_resolution")
        self.assertEqual(classify_title("طرح اصلاح قانون"), "bill")

    def test_official_http_source_is_normalized_to_https(self):
        self.assertEqual(normalize_url("http://media.dotic.ir/uploads/law.pdf"), "https://media.dotic.ir/uploads/law.pdf")
        self.assertIsNone(normalize_url("http://example.com/law"))
        self.assertEqual(normalize_url("https://qavanin.ir/law/1"), "https://qavanin.ir/law/1")

    def test_law_and_article_rows_are_grouped_by_stable_law_cid(self):
        rows = [
            {
                "record_type": "law", "law_cid": "cid-law-1", "title": "قانون مدنی",
                "source_url": "https://dotic.ir/law/1", "body": "متن کامل قانون مدنی",
                "authority": "non_authoritative", "license": "ir-dotic",
                "snapshot_date": "2026-11-02",
            },
            {
                "record_type": "article", "law_cid": "cid-law-1", "instrument_title": "قانون مدنی",
                "article_number": "1", "article_title": "ماده ۱", "body": "متن ماده اول",
                "source_url": "https://dotic.ir/law/1", "entry_cid": "cid-article-1",
            },
            {
                "record_type": "section", "law_cid": "cid-law-1", "instrument_title": "قانون مدنی",
                "article_number": "بند الف", "article_title": "بند الف", "body": "متن بند الف",
                "source_url": "https://dotic.ir/law/1", "entry_cid": "cid-section-1",
            },
        ]
        docs = build_documents(rows, "revision-abc")
        self.assertEqual(len(docs), 1)
        doc = docs[0]
        self.assertEqual(doc["slug"], "iran-ir-" + doc["slug"].removeprefix("iran-ir-"))
        self.assertEqual(doc["law_type"], "law")
        self.assertEqual(doc["official_source_url"], "https://dotic.ir/law/1")
        self.assertEqual(len(doc["articles"]), 2)
        self.assertEqual(doc["articles"][0]["number"], "1")
        self.assertIn("needs_review", doc["notes"])
        self.assertIn("non_authoritative", doc["notes"])

    def test_duplicate_article_numbers_keep_both_source_entries(self):
        rows = [
            {"record_type": "article", "law_cid": "cid-law-2", "instrument_title": "آیین‌نامه نمونه",
             "article_number": "1", "article_title": "ماده ۱", "body": "متن اول", "entry_cid": "entry-1"},
            {"record_type": "article", "law_cid": "cid-law-2", "instrument_title": "آیین‌نامه نمونه",
             "article_number": "1", "article_title": "ماده ۱", "body": "متن دوم", "entry_cid": "entry-2"},
        ]
        docs = build_documents(rows, "revision-abc")
        self.assertEqual(len(docs), 1)
        self.assertEqual(len(docs[0]["articles"]), 2)
        self.assertNotEqual(docs[0]["articles"][0]["number"], docs[0]["articles"][1]["number"])

    def test_long_duplicate_article_numbers_remain_unique_after_truncation(self):
        long_number = "ماده " + ("بند تکراری " * 30)
        rows = [
            {"record_type": "article", "law_cid": "cid-law-long", "instrument_title": "قانون نمونه",
             "article_number": long_number, "article_title": "ماده طولانی", "body": "متن اول", "entry_cid": "entry-a"},
            {"record_type": "article", "law_cid": "cid-law-long", "instrument_title": "قانون نمونه",
             "article_number": long_number, "article_title": "ماده طولانی", "body": "متن دوم", "entry_cid": "entry-b"},
        ]
        docs = build_documents(rows, "revision-abc")
        numbers = [article["number"] for article in docs[0]["articles"]]
        self.assertEqual(len(numbers), 2)
        self.assertEqual(len(set(numbers)), 2)
        self.assertTrue(all(len(number) <= 120 for number in numbers))

    def test_article_only_rows_still_create_a_parent_document(self):
        rows = [{
            "record_type": "article", "law_cid": "cid-law-3", "instrument_title": "قانون حمایت نمونه",
            "article_number": "2", "article_title": "ماده ۲", "body": "متن ماده دوم",
            "source_url": "https://rrk.ir/law/3",
        }]
        docs = build_documents(rows, "revision-abc")
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]["title"], "قانون حمایت نمونه")
        self.assertEqual(docs[0]["articles"][0]["body"], "متن ماده دوم")


if __name__ == "__main__":
    unittest.main()
