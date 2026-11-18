-- 0033: pre-create the academy's core public legal-specialty groups.
-- Use the earliest registered account as the technical owner; all approved
-- members can discover and join these public groups.
INSERT INTO community_groups(name,description,visibility,owner_id)
SELECT seed.name,seed.description,'public',(SELECT id FROM users ORDER BY id LIMIT 1)
FROM (
  SELECT 'حقوق مدنی و قراردادها' AS name,'بحث و تبادل نظر درباره تعهدات، قراردادها، مسئولیت مدنی، اموال و مالکیت' AS description
  UNION ALL SELECT 'حقوق کیفری','تحلیل جرایم، مجازات‌ها، ادله اثبات، مسئولیت کیفری و رویه قضایی'
  UNION ALL SELECT 'حقوق کار و تأمین اجتماعی','روابط کارگر و کارفرما، قرارداد کار، بیمه، بازنشستگی و دعاوی کار'
  UNION ALL SELECT 'حقوق مالیاتی','قوانین مالیاتی، دادرسی مالیاتی، مالیات‌های مستقیم و ارزش افزوده'
  UNION ALL SELECT 'حقوق تجارت و شرکت‌ها','شرکت‌های تجاری، اسناد تجاری، ورشکستگی و قراردادهای بازرگانی'
  UNION ALL SELECT 'حقوق خانواده','ازدواج، طلاق، مهریه، نفقه، حضانت و امور حسبی'
  UNION ALL SELECT 'حقوق اداری و دیوان عدالت','تصمیمات و مقررات اداری، شکایات استخدامی و دعاوی دیوان عدالت اداری'
  UNION ALL SELECT 'حقوق ثبت و املاک','ثبت اسناد و املاک، مالکیت، اسناد رسمی و دعاوی ثبتی'
  UNION ALL SELECT 'آیین دادرسی و اجرای احکام','آیین دادرسی مدنی و کیفری، ادله، اجرای احکام و اقدامات تأمینی'
) AS seed
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
