import importlib.util
import json
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

    def test_all_phase_covers_statutes_regulations_and_judicial_authorities(self):
        self.assertIn("treaty", importer.PHASE_TYPES["laws"])
        self.assertNotIn("bylaw", importer.PHASE_TYPES["laws"])
        self.assertIn("bylaw", importer.PHASE_TYPES["all"])
        self.assertIn("executive_regulation", importer.PHASE_TYPES["all"])
        self.assertIn("executive_circular", importer.PHASE_TYPES["all"])
        self.assertIn("judicial_advisory_opinion", importer.PHASE_TYPES["all"])
        self.assertIn("supreme_court_unified_precedent", importer.PHASE_TYPES["all"])
        self.assertIn("administrative_court_general_board", importer.PHASE_TYPES["all"])
        self.assertIn("judicial_decision", importer.PHASE_TYPES["all"])
        self.assertNotIn("judicial_advisory_opinion", importer.PHASE_TYPES["laws"])
        self.assertIn("judicial_advisory_opinion", importer.PHASE_TYPES["judicial"])

    def test_category_files_are_discovered_with_recursive_tree(self):
        fake = type("Response", (), {"json": lambda self: {"truncated": False, "tree": [
            {"type": "blob", "path": "data/laws/civil.md"},
            {"type": "blob", "path": "data/cats/آرا وحدت رویه/precedent.md"},
            {"type": "blob", "path": "data/cats/نظریه‌های مشورتی/opinion.md"},
            {"type": "blob", "path": "README.md"},
        ]}})()
        with patch.object(importer, "get", return_value=fake):
            files = importer.get_files()
        self.assertEqual(files, ["data/cats/آرا وحدت رویه/precedent.md", "data/cats/نظریه‌های مشورتی/opinion.md", "data/laws/civil.md"])

    def test_category_taxonomy_covers_ekhtebar_families(self):
        cases = [
            ("data/cats/آرا وحدت رویه/x.md", "رأی وحدت رویه شماره ۸۸۰", "supreme_court_unified_precedent"),
            ("data/cats/نظریه‌های مشورتی/x.md", "نظریه مشورتی اداره کل حقوقی", "judicial_advisory_opinion"),
            ("data/cats/آیین‌نامه‌ها/x.md", "آیین‌نامه نمونه", "bylaw"),
            ("data/cats/بخشنامه‌ها/x.md", "بخشنامه وزارت کشور", "executive_circular"),
            ("data/cats/آرای دیوان عدالت اداری/x.md", "رأی هیئت عمومی دیوان عدالت اداری", "administrative_court_general_board"),
            ("data/cats/مصوبات/x.md", "مصوبه هیئت وزیران", "executive_resolution"),
            ("data/cats/طرح و لایحه/x.md", "طرح اصلاح قانون", "bill"),
            ("data/cats/نظریه‌های رئیس مجلس/x.md", "نظر رئیس مجلس", "parliamentary_review_opinion"),
            ("data/cats/نشست‌های قضایی/x.md", "نشست قضایی", "judicial_session"),
            ("data/cats/رویه قضایی/x.md", "رأی دادگاه", "judicial_decision"),
            ("data/cats/سیاست‌های کلی/x.md", "سیاست کلی", "general_policies"),
        ]
        for path, title, expected in cases:
            self.assertEqual(importer.category_type(path, title), expected)

    def test_full_text_judicial_opinion_is_not_split_into_fake_articles(self):
        markdown = """# نظریه مشورتی اداره کل حقوقی قوه قضائیه
> منبع: https://www.ekhtebar.ir/sample-opinion/

سؤال: متن پرسش حقوقی با جزئیات کافی برای آزمون استخراج از سند منتشرشده.

نظریه: پاسخ اداره کل حقوقی در خصوص تفسیر مقررات و آثار قانونی موضوع مورد سؤال به شرح زیر است."""
        with patch.object(importer, "get", return_value=FakeResponse(markdown)):
            doc, reason = importer.parse_doc("data/cats/نظریه‌های مشورتی/sample.md", {})
        self.assertIsNone(reason)
        self.assertEqual(doc["lawType"], "judicial_advisory_opinion")
        self.assertEqual(doc["articles"][0]["number"], "متن کامل")
        self.assertIn("نظریه:", doc["articles"][0]["body"])

    def test_specific_document_families_keep_precedence(self):
        self.assertEqual(importer.classify("رأی وحدت رویه دیوان عالی کشور"), "supreme_court_unified_precedent")
        self.assertEqual(importer.classify("رأی اصراری دیوان عالی کشور"), "supreme_court_insistence_precedent")
        self.assertEqual(importer.classify("رأی هیئت عمومی دیوان عدالت اداری"), "administrative_court_general_board")
        self.assertEqual(importer.classify("نظریه مشورتی اداره کل حقوقی قوه قضائیه"), "judicial_advisory_opinion")
        self.assertEqual(importer.classify("کنوانسیون حقوقی"), "treaty")

    def test_official_source_is_only_detected_when_direct_qavanin_or_gazette_link_exists(self):
        self.assertEqual(importer.find_official_source_url("https://www.ekhtebar.ir/law/"), "")
        self.assertEqual(importer.find_official_source_url("منبع: https://qavanin.ir/Law/TreeText/?IDS=123"), "https://qavanin.ir/Law/TreeText/?IDS=123")
        self.assertEqual(importer.find_official_source_url("https://www.rrk.ir/News/ShowNews.aspx?id=12"), "https://www.rrk.ir/News/ShowNews.aspx?id=12")
        unrelated_body = "\n".join(["# قانون نمونه", "متن ماده", *("متن" for _ in range(12)), "https://qavanin.ir/Law/TreeText/?IDS=456"])
        self.assertEqual(importer.find_official_source_url(unrelated_body), "")

    def test_article_heading_with_closing_parenthesis_is_parsed(self):
        markdown = "# قانون دریایی\nhttps://www.ekhtebar.ir/sample-law/\n\nماده ۱) شرایط تابعیت کشتی\nمتن ماده نخست"
        with patch.object(importer, "get", return_value=FakeResponse(markdown)):
            doc, reason = importer.parse_doc("data/laws/sample.md", {})
        self.assertIsNone(reason)
        self.assertEqual(doc["articles"][0]["number"], "1")
        self.assertIn("شرایط تابعیت کشتی", doc["articles"][0]["body"])

    def test_daily_change_detection_separates_new_changed_and_unchanged_documents(self):
        docs = [
            {"slug": "new-law", "contentSha256": "a" * 64},
            {"slug": "same-law", "contentSha256": "b" * 64},
            {"slug": "changed-law", "contentSha256": "c" * 64},
        ]
        existing = [
            {"slug": "same-law", "content_sha256": "b" * 64, "status": "needs_review", "protected_articles": 0},
            {"slug": "changed-law", "content_sha256": "d" * 64, "status": "needs_review", "protected_articles": 0},
            {"slug": "protected-law", "content_sha256": "e" * 64, "status": "verified", "protected_articles": 0},
            {"slug": "rehash-law", "content_sha256": None, "status": "needs_review", "protected_articles": 0},
        ]
        docs.extend([
            {"slug": "protected-law", "contentSha256": "f" * 64},
            {"slug": "rehash-law", "contentSha256": "g" * 64},
        ])
        new_docs, refreshable, protected, unchanged = importer.partition_document_updates(docs, existing)
        self.assertEqual([doc["slug"] for doc in new_docs], ["new-law"])
        self.assertEqual([(doc["slug"], old_hash) for doc, old_hash in refreshable], [
            ("changed-law", "d" * 64), ("rehash-law", None)
        ])
        self.assertEqual([(doc["slug"], old_hash) for doc, old_hash in protected], [("protected-law", "e" * 64)])
        self.assertEqual(unchanged, 1)

    def test_automatic_updates_preserve_verified_documents_and_refresh_only_unverified(self):
        migration = (MODULE_PATH.parent.parent / "worker" / "migrations" / "0039_legal_document_update_queue.sql").read_text(encoding="utf-8")
        self.assertIn("proposed_payload_json", migration)
        self.assertIn("previous_sha256", migration)
        self.assertIn("UNIQUE(slug, proposed_sha256)", migration)
        self.assertIn("DEFAULT 'needs_review'", migration)
        statements = importer.refresh_statements({
            "slug":"sample-law","title":"قانون نمونه","lawType":"law","sourceName":"اختبار",
            "sourceUrl":"https://www.ekhtebar.ir/sample/","notes":"needs review",
            "officialSourceUrl":"","discoverySourceUrl":"https://www.ekhtebar.ir/sample/",
            "contentSha256":"a"*64,"articles":[{"number":"1","heading":"ماده ۱","body":"متن"}]
        })
        combined = "\n".join(sql for sql,_ in statements)
        self.assertIn("INSERT INTO legal_document_versions", combined)
        self.assertIn("INSERT INTO legal_article_versions", combined)
        self.assertIn("automatic_source_refresh", combined)
        self.assertIn("status='needs_review'", combined)
        self.assertIn("NOT EXISTS", combined)
        self.assertIn("p.status IN ('verified','amended','repealed')", combined)
        self.assertIn("review_status='accepted'", combined)

    def test_priority_coverage_distinguishes_present_missing_and_repealed(self):
        manifest = {
            "documents": [
                {"key": "civil", "title": "قانون مدنی", "aliases": ["قانون مدنی"]},
                {"key": "civil-procedure", "title": "قانون آیین دادرسی مدنی", "aliases": ["قانون آیین دادرسی مدنی"]},
                {"key": "cheque", "title": "قانون صدور چک", "aliases": ["قانون صدور چک"]},
            ]
        }
        docs = [
            {"title": "قانون مدنی", "slug": "civil", "lawType": "law"},
            {"title": "قانون صدور چک منسوخ", "slug": "old-cheque", "lawType": "law"},
        ]
        audit = importer.priority_coverage(docs, manifest)
        self.assertEqual(audit["present_in_source_mirror"], 1)
        self.assertEqual(audit["missing_from_source_mirror"], 2)
        self.assertEqual(audit["verified"], 0)
        self.assertEqual(audit["documents"][1]["status"], "missing_from_source_mirror")

    def test_priority_coverage_distinguishes_indexed_from_unparsed(self):
        manifest = {"documents":[{"key":"civil","title":"قانون مدنی","domain":"civil"}]}
        audit = importer.priority_coverage([],manifest,["قانون مدنی"])
        self.assertEqual(audit["present_in_source_mirror"],1)
        self.assertEqual(audit["parsed_in_source_mirror"],0)
        self.assertEqual(audit["indexed_not_parsed"],1)
        self.assertEqual(audit["documents"][0]["status"],"indexed_not_parsed")

    def test_empty_auto_refresh_stats_include_archive_counters(self):
        stats = importer.refresh_unverified_documents([])
        self.assertEqual(stats["documents_updated"],0)
        self.assertEqual(stats["versions_archived"],0)
        self.assertEqual(stats["articles_archived"],0)

    def test_priority_coverage_reports_domain_breakdown(self):
        manifest = {
            "documents": [
                {"key": "civil", "title": "قانون مدنی", "domain": "civil", "priority": "core"},
                {"key": "tax", "title": "قانون مالیات‌های مستقیم", "domain": "tax", "priority": "extended"},
            ]
        }
        docs = [{"title": "قانون مدنی", "slug": "civil", "lawType": "law"}]
        audit = importer.priority_coverage(docs, manifest)
        self.assertEqual(audit["by_domain"]["civil"]["present_in_source_mirror"], 1)
        self.assertEqual(audit["by_domain"]["tax"]["missing_from_source_mirror"], 1)
        self.assertEqual(audit["by_domain"]["tax"]["verified"], 0)

    def test_expanded_manifest_has_broad_domain_coverage(self):
        manifest_path = MODULE_PATH.parent / "legal_priority_documents.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        keys = {item["key"] for item in manifest["documents"]}
        domains = {item.get("domain") for item in manifest["documents"]}
        self.assertGreaterEqual(len(keys), 170)
        self.assertGreaterEqual(len(domains), 15)
        self.assertTrue({"tax-direct", "vat", "official-registration-transactions", "landlord-1356", "landlord-1362", "landlord-1376", "patents", "clean-air"} <= keys)

    def test_priority_manifest_has_core_litigation_statutes(self):
        manifest_path = MODULE_PATH.parent / "legal_priority_documents.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        keys = {item["key"] for item in manifest["documents"]}
        self.assertTrue({"civil-code", "civil-procedure", "criminal-code-1392", "criminal-procedure", "civil-enforcement", "financial-judgments", "cheques", "family-protection", "housing-market-regulation", "taxpayer-obligations", "spy-and-hostile-cooperation", "drone-regulation-act", "iran-russia-strategic-treaty"} <= keys)

    def test_parse_doc_extracts_title_and_article_without_network(self):
        markdown = "# قانون نمونه\nhttps://www.ekhtebar.ir/sample-law/\n\nماده ۱\nمتن ماده نخست"
        with patch.object(importer, "get", return_value=FakeResponse(markdown)):
            doc, reason = importer.parse_doc("data/laws/sample.md", {})
        self.assertIsNone(reason)
        self.assertEqual(doc["title"], "قانون نمونه")
        self.assertEqual(doc["lawType"], "law")
        self.assertEqual(doc["officialSourceUrl"], "")
        self.assertEqual(doc["discoverySourceUrl"], "https://www.ekhtebar.ir/sample-law/")
        self.assertEqual(doc["sourceUrl"], "https://www.ekhtebar.ir/sample-law/")
        self.assertEqual(len(doc["contentSha256"]), 64)
        self.assertEqual(len(doc["articles"]), 1)
        self.assertEqual(doc["articles"][0]["number"], "1")
        self.assertIn("متن ماده نخست", doc["articles"][0]["body"])


if __name__ == "__main__":
    unittest.main()
