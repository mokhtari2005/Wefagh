import unittest

from scripts.parse_national_judgment import parse_judgment


SAMPLE = """
<html><body>
<h1>عنوان: مصداق خلاف بیّن شرع</h1>
<p>پیام: پذیرش درخواست تجدیدنظر خارج از مهلت قانونی و رسیدگی به آن، از مصادیق خلاف بیّن شرع است.</p>
<p>شماره دادنامه قطعی : ۹۰۰۹۸۲۱۱۵۲۹۰۰۷۹۷</p>
<p>تاریخ دادنامه قطعی : ۱۳۹۵/۰۵/۱۸</p>
<p>گروه رأی: کیفری</p>
<h2>رأی خلاصه جریان پرونده</h2>
<p>محتویات پرونده حاکیست آقای الف. الف.ش. در تاریخ 90/08/29 شکایتی علیه آقای م. الف.ش. دایر به ممانعت از حق به نحو جلوگیری از ورود شاکی به مغازه نانوایی اشتراکی، به دادسرای ناحیه 4 تهران تقدیم و دادسرا پرونده را با صدور قرار مجرمیت و کیفرخواست به دادگاه ارسال نموده است. شعبه 1078 دادگاه عمومی (جزایی) تهران پس از رسیدگی به موضوع، حکم برائت متهم را صادر کرده است.</p>
<p>تماس با ما</p>
</body></html>
"""


class NationalJudgmentParserTests(unittest.TestCase):
    def test_extracts_metadata_and_full_text(self):
        result = parse_judgment(SAMPLE, "https://ara.jri.ac.ir/Judge/Text/34496")
        self.assertEqual(result["slug"], "ara-jri-34496")
        self.assertEqual(result["metadata"]["judgment_number"], "9009821152900797")
        self.assertEqual(result["metadata"]["judgment_date"], "1395/05/18")
        self.assertEqual(result["lawType"], "judicial_decision")
        self.assertEqual(result["status"], "needs_review")
        self.assertIn("محتویات پرونده", result["articles"][0]["body"])

    def test_rejects_noncanonical_source(self):
        with self.assertRaises(ValueError):
            parse_judgment(SAMPLE, "https://example.com/Judge/Text/34496")

    def test_body_reference_to_unified_precedent_does_not_change_document_type(self):
        html = SAMPLE.replace(
            "به دادسرای ناحیه 4 تهران تقدیم",
            "با توجه به رأی وحدت رویه دیوان عالی کشور، به دادسرای ناحیه 4 تهران تقدیم",
        )
        result = parse_judgment(html, "https://ara.jri.ac.ir/Judge/Text/34496")
        self.assertEqual(result["lawType"], "judicial_decision")

    def test_explicit_unified_precedent_title_is_classified(self):
        html = SAMPLE.replace("عنوان: مصداق خلاف بیّن شرع", "عنوان: رأی وحدت رویه شماره ۸۲۱")
        result = parse_judgment(html, "https://ara.jri.ac.ir/Judge/Text/34496")
        self.assertEqual(result["lawType"], "supreme_court_unified_precedent")

    def test_rejects_page_without_required_metadata(self):
        with self.assertRaises(ValueError):
            parse_judgment("<h1>صفحه ناقص</h1>", "https://ara.jri.ac.ir/Judge/Text/34496")


if __name__ == "__main__":
    unittest.main()
