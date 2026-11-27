-- Register the public DOTIC-derived research snapshot as a secondary bulk source.
INSERT OR IGNORE INTO legal_document_sources
(source_key,title,authority,document_types,base_url,access_mode,notes)
VALUES
('iran-laws-graphrag','پیکره پژوهشی قوانین ایران (برگرفته از DOTIC)','پیکره پژوهشی قوانین ایران؛ منبع ثانویه','law,bylaw,executive_regulation,executive_circular,executive_resolution,general_policies,treaty,bill,other','https://huggingface.co/datasets/justicedao/ipfs_iran_laws_ir','bulk_download','نسخه پژوهشی CID-keyed از داده‌های بالادستی DOTIC؛ همه رکوردها needs_review می‌مانند و متن رسمی روزنامه رسمی یا سامانه ملی قوانین و مقررات مرجع نهایی است.');
