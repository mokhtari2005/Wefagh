import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "test-account")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "test-token")
MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "import_ekhtebar_corpus.py"
SPEC = importlib.util.spec_from_file_location("legal_importer", MODULE_PATH)
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


class FakeResponse:
    def __init__(self, text):
        self.text = text


class LegalCorpusImporterTests(unittest.TestCase):
    def test_statute_title_with_internal_regulation_word_is_law(self):
        self.assertEqual(importer.classify("قانون آیین‌نامه داخلی مجلس شورای اسلامی"), "law")
        self.assertEqual(importer.classify("قانون اصلاح آیین نامه داخلی مجلس"), "law")

    def test_treaty_statutes_are_in_laws_phase(self):
        self.assertIn("treaty", importer.PHASE_TYPES["laws"])
        self.assertNotIn("bylaw", importer.PHASE_TYPES["laws"])

    def test_specific_document_families_keep_precedence(self):
        self.assertEqual(importer.classify("رأی وحدت رویه دیوان عالی کشور"), "supreme_court_unified_precedent")
        self.assertEqual(importer.classify("نظریه مشورتی اداره کل حقوقی قوه قضائیه"), "judicial_advisory_opinion")
        self.assertEqual(importer.classify("کنوانسیون حقوقی"), "treaty")

    def test_parse_doc_extracts_title_and_article_without_network(self):
        markdown = "# قانون نمونه\nhttps://www.ekhtebar.ir/sample-law/\n\nماده ۱\nمتن ماده نخست"
        with patch.object(importer, "get", return_value=FakeResponse(markdown)):
            doc, reason = importer.parse_doc("data/laws/sample.md", {})
        self.assertIsNone(reason)
        self.assertEqual(doc["title"], "قانون نمونه")
        self.assertEqual(doc["lawType"], "law")
        self.assertEqual(len(doc["articles"]), 1)
        self.assertEqual(doc["articles"][0]["number"], "1")
        self.assertIn("متن ماده نخست", doc["articles"][0]["body"])


if __name__ == "__main__":
    unittest.main()
