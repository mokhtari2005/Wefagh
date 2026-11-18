-- 0033: pre-create the academy's core public legal-specialty groups.
-- Use a VALUES CTE instead of a compound SELECT: D1 limits compound SELECT terms.
-- Use the earliest registered account as technical owner; approved members can join.
WITH seed(name, description) AS (
  VALUES
    ('حقوق مدنی و قراردادها','بحث و تبادل نظر درباره تعهدات، قراردادها، مسئولیت مدنی، اموال و مالکیت'),
    ('حقوق کیفری','تحلیل جرایم، مجازات‌ها، ادله اثبات، مسئولیت کیفری و رویه قضایی'),
    ('حقوق کار و تأمین اجتماعی','روابط کارگر و کارفرما، قرارداد کار، بیمه، بازنشستگی و دعاوی کار'),
    ('حقوق مالیاتی','قوانین مالیاتی، دادرسی مالیاتی، مالیات‌های مستقیم و ارزش افزوده'),
    ('حقوق تجارت و شرکت‌ها','شرکت‌های تجاری، اسناد تجاری، ورشکستگی و قراردادهای بازرگانی'),
    ('حقوق خانواده','ازدواج، طلاق، مهریه، نفقه، حضانت و امور حسبی'),
    ('حقوق اداری و دیوان عدالت','تصمیمات و مقررات اداری، شکایات استخدامی و دعاوی دیوان عدالت اداری'),
    ('حقوق ثبت و املاک','ثبت اسناد و املاک، مالکیت، اسناد رسمی و دعاوی ثبتی'),
    ('آیین دادرسی و اجرای احکام','آیین دادرسی مدنی و کیفری، ادله، اجرای احکام و اقدامات تأمینی')
)
INSERT INTO community_groups(name,description,visibility,owner_id)
SELECT seed.name,seed.description,'public',(SELECT id FROM users ORDER BY id LIMIT 1)
FROM seed
WHERE EXISTS (SELECT 1 FROM users)
  AND NOT EXISTS (SELECT 1 FROM community_groups g WHERE g.name=seed.name);

INSERT OR IGNORE INTO community_group_members(group_id,user_id,role)
SELECT g.id,g.owner_id,'owner'
FROM community_groups g
WHERE g.name IN (
  'حقوق مدنی و قراردادها','حقوق کیفری','حقوق کار و تأمین اجتماعی','حقوق مالیاتی',
  'حقوق تجارت و شرکت‌ها','حقوق خانواده','حقوق اداری و دیوان عدالت','حقوق ثبت و املاک',
  'آیین دادرسی و اجرای احکام'
);
