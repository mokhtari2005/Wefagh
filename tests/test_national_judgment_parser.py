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


    def test_parses_current_portal_body_heading(self):
        html = """
        <html><body>
        <h1>عنوان: تغییر جنسیت</h1>
        <p>پیام: حسب مفاد گواهی پزشکی قانونی خواهان شرایط تغییر جنسیت را ندارد.</p>
        <p>شماره دادنامه قطعی :</p><p>140109390010507257</p>
        <p>تاریخ دادنامه قطعی :</p><p>1401/08/30</p>
        <p>گروه رأی:</p><p>حقوقی</p>
        <h2>رأی دادگاه بدوی</h2>
        <p>خواسته خانم ف. ف. ز. ع. فرزند م. ا. به طرفیت دادستان، تغییر جنسیت از مونث به مذکر است. خواهان اظهار نموده مبتلا به اختلال هویت جنسی است و ادامه زندگی با وصف شرایط مذکور بر وی سخت و دشوار است. خواهان صدور حکم به تغییر جنسیت می‌باشد. حسب مفاد گواهی پزشکی قانونی خواهان شرایط تغییر جنسیت را ندارد. با توجه به مفاد گواهی پزشکی قانونی و نظر موافق قاضی مشاور و به استناد ماده ۱۲۵۷ قانون مدنی حکم بر بطلان دعوی صادر و اعلام می‌نماید.</p>
        <h2>نقد رأی</h2><p>تماس با ما</p>
        </body></html>
        """
        result = parse_judgment(html, "https://ara.jri.ac.ir/Judge/Text/42028")
        self.assertEqual(result["metadata"]["judgment_number"], "140109390010507257")
        self.assertIn("خواسته خانم", result["articles"][0]["body"])
        self.assertNotIn("تماس با ما", result["articles"][0]["body"])

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

    def test_accepts_public_page_without_number_or_date(self):
        # Captured from the live public page structure: the visible heading is
        # the judgment title and the page does not expose number/date metadata.
        html = """
        <html><body><div id="treeText">
        <h1>رأی دادگاه بدوی</h1>
        <p>پرونده کلاسه *تصمیم نهایی شماره *</p>
        <p>خواهان: خانم ف. ف. ز. ع. فرزند م.</p>
        <p>خوانده: ساختمان دادگستری کل استان</p>
        <p>خواسته: تغییر جنسیت</p>
        <p>رای دادگاه</p>
        <p>خواسته خانم ف. ف. ز. ع. فرزند م. به طرفیت دادستان تغییر جنسیت ازمونث به مذکراست. خواهان اظهار نموده مبتلا به اختلال هویت جنسی است و ادامه زندگی با وصف شرایط مذکور بر وی سخت و دشوار است. حسب مفاد گواهی پزشکی قانونی خواهان شرایط تغییر جنسیت را ندارد. با توجه به مفاد گواهی پزشکی قانونی و نظر موافق قاضی مشاور و به استناد ماده ۱۲۵۷ قانون مدنی حکم بر بطلان دعوی صادر و اعلام می‌نماید. رای دادگاه حضوری و ظرف بیست روز از تاریخ ابلاغ قابل تجدیدنظرخواهی است.</p>
        </div></body></html>
        """
        result = parse_judgment(html, "https://ara.jri.ac.ir/Judge/Text/42028")
        self.assertEqual(result["title"], "رأی دادگاه بدوی")
        self.assertIsNone(result["metadata"]["judgment_number"])
        self.assertIsNone(result["metadata"]["judgment_date"])
        self.assertEqual(result["metadata"]["missing_metadata"], ["judgment_number", "judgment_date"])
        self.assertIn("خواسته خانم", result["articles"][0]["body"])
        self.assertEqual(result["status"], "needs_review")

    def test_rejects_page_without_title_or_judgment_text(self):
        with self.assertRaises(ValueError):
            parse_judgment("<h1>صفحه ناقص</h1>", "https://ara.jri.ac.ir/Judge/Text/34496")


if __name__ == "__main__":
    unittest.main()
