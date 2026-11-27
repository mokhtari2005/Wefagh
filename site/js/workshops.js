import { getJson } from './api.js';
// کارگاه‌های مهارت‌محور آکادمی؛ از ابزارها و زیرسامانه‌های موجود استفاده می‌کند.
export const WORKSHOPS = [
  {id:'drafting',title:'کارگاه تنظیم حرفه‌ای اسناد قضایی',level:'دانشجو تا وکیل',courseIds:["legal-writing-workshop"],summary:'تمرین ساختاردهی، خواسته‌نویسی، شرح ماوقع، استدلال و استناد در اسناد قضایی.',skills:['دادخواست و تعیین خواسته','شکواییه و تحلیل عنوان اتهامی','لوایح دفاعیه و پاسخ به ایرادات','اظهارنامه، اعتراض به نظریه کارشناسی و درخواست‌های اجرایی','بازبینی نگارشی و کنترل استنادها'],actions:[['آزمایشگاه دستیار وکیل','/assistant/documents'],['بانک پرونده‌های آموزشی','/cases'],['بانک قوانین و مقررات','/laws']]},
  {id:'case-analysis',title:'کارگاه تحلیل پرونده از پذیرش تا اجرای رأی',level:'کارآموز تا وکیل',courseIds:["civil-litigation-practice","evidence-and-proof"],summary:'یادگیری روش حرفه‌ای خواندن پرونده، کشف مسائل، تعیین راهبرد و پیگیری مراحل رسیدگی.',skills:['مصاحبه اولیه و استخراج واقعیت‌های مؤثر','فهرست‌برداری و ارزیابی ادله','تشخیص خواسته، دعوا و ایرادات شکلی','طراحی راهبرد و پیش‌بینی دفاع طرف مقابل','تحلیل رأی، اعتراض و اجرای حکم'],actions:[['بانک پرونده‌های آموزشی','/cases'],['داشبورد و سوابق آموزشی','/dashboard'],['دستیار هوشمند وکیل','/assistant']]},
  {id:'advocacy',title:'کارگاه فن دفاع، مذاکره و حضور در دادگاه',level:'کارآموز تا وکیل',courseIds:["oral-advocacy-workshop"],summary:'تمرین دفاع شفاهی، پاسخ به پرسش‌های قاضی، مواجهه با دفاع طرف مقابل و مذاکره حقوقی.',skills:['ساختار دفاع شفاهی کوتاه و مستند','پاسخ به پرسش و ایراد قاضی','طرح پرسش از شاهد و کارشناس','مدیریت تنش و رعایت شأن حرفه‌ای','مذاکره، سازش و تنظیم توافق'],actions:[['شبیه‌ساز دادگاه و موت‌کورت','/moot-court'],['بانک پرونده‌های آموزشی','/cases'],['کارگاه تنظیم اسناد','/assistant/documents']]},
  {id:'litigation',title:'کارگاه آیین دادرسی و مدیریت جریان دعوا',level:'دانشجو تا وکیل',courseIds:["civil-litigation-practice"],summary:'آموزش عملی تشخیص مسیر رسیدگی و انتخاب اقدام مناسب در هر مرحله.',skills:['صلاحیت و ارجاع پرونده','ابلاغ، مواعد و اقدامات مقدماتی','ایرادات، تأمین خواسته و دستور موقت','تجدیدنظر، فرجام، واخواهی و اعاده دادرسی','اجرای احکام و پیگیری عملیات اجرایی'],actions:[['تقویم مواعد','/deadlines'],['محاسبه‌گرهای حقوقی','/calculators'],['بانک قوانین و مقررات','/laws']]},
  {id:'contracts',title:'کارگاه تنظیم، تحلیل و مذاکره قراردادها',level:'دانشجو تا وکیل',courseIds:["contract-drafting"],summary:'تمرین طراحی قرارداد متناسب با هدف طرفین، کنترل ریسک و مدیریت اختلافات قراردادی.',skills:['شناسایی قصد و موضوع قرارداد','تعهدات، شروط، تضمین‌ها و وجه التزام','فسخ، انفساخ، اقاله و آثار نقض تعهد','مسئولیت، فورس‌ماژور و حل اختلاف','بازبینی قرارداد و تهیه چک‌لیست ریسک'],actions:[['دستیار تنظیم اسناد','/assistant/documents'],['دستیار هوشمند وکیل','/assistant'],['بانک قوانین و مقررات','/laws']]},
  {id:'specialties',specialtyTracks:true,title:'کارگاه‌های تخصصی حوزه‌های حقوقی',level:'کارآموز تا وکیل',courseIds:[],summary:'مسیرهای موضوعی برای تعمیق مهارت در دعاوی مدنی، کیفری، خانواده، تجارت، کار، املاک و بانکداری.',skills:['مدنی: مالکیت، تعهدات و مسئولیت مدنی','کیفری: جرایم مالی و ادله اثبات','خانواده: دعاوی و اجرای احکام','تجارت و شرکت‌ها: اسناد تجاری و اختلافات شرکا','کار، تأمین اجتماعی، املاک، ثبت، بانکی و مالیاتی'],actions:[['دوره‌های آموزشی','/courses'],['بانک پرونده‌های آموزشی','/cases'],['بانک قوانین و مقررات','/laws']]},
  {id:'office',title:'کارگاه مدیریت دفتر وکالت و ارتباط با موکل',level:'وکیل جوان تا حرفه‌ای',courseIds:["law-office-management-workshop"],summary:'مهارت‌های اداره دفتر، پذیرش پرونده، تنظیم توافق مالی و نگهداری امن اسناد.',skills:['فرایند پذیرش و احراز تعارض منافع','قرارداد حق‌الوکاله و شفاف‌سازی خدمات','مدیریت ارتباط و انتظارات موکل','ساختاردهی پرونده و بایگانی اسناد','کنترل مواعد، پیگیری‌ها و گردش کار دفتر'],actions:[['بانک پرونده‌های آموزشی','/cases'],['تقویم مواعد','/deadlines'],['محاسبه‌گر حق‌الوکاله','/calculators/attorney']]},
  {id:'legal-tech',title:'کارگاه فناوری حقوقی و هوش مصنوعی',level:'همه سطوح',courseIds:["legal-technology-workshop"],summary:'استفاده مسئولانه از ابزارهای دیجیتال برای تحقیق، نگارش، تحلیل و مدیریت کار حقوقی.',skills:['جست‌وجوی هدفمند در منابع حقوقی','کار با دستیار وکیل و تنظیم دستور دقیق','راستی‌آزمایی مواد قانونی و آرای قضایی','حفاظت از محرمانگی و داده‌های موکل','تشخیص خطا، توهم و محدودیت خروجی هوش مصنوعی'],actions:[['دستیار هوشمند وکیل','/assistant'],['بانک قوانین و مقررات','/laws'],['تایپ صوتی','/voice-typing']]},
  {id:'research',title:'کارگاه تحقیق و استدلال حقوقی',level:'دانشجو تا وکیل',courseIds:["legal-research-workshop"],summary:'تبدیل پرسش حقوقی به تحقیق مستند و استدلال قابل دفاع.',skills:['صورت‌بندی مسئله و پرسش پژوهش','یافتن متن معتبر قانون و اصلاحات','جست‌وجوی رأی وحدت رویه و نظریه مشورتی','تفکیک منبع رسمی، ثانویه و آموزشی','ساخت زنجیره استدلال و ارجاع دقیق'],actions:[['بانک قوانین و مقررات','/laws'],['دستیار هوشمند وکیل','/assistant'],['رسانه و اندیشه','/media']]},
  {id:'ethics',title:'کارگاه اخلاق، مسئولیت و شئون حرفه‌ای',level:'کارآموز تا وکیل',courseIds:["professional-ethics-workshop"],summary:'تمرین تصمیم‌گیری مسئولانه در رابطه با موکل، دادگاه، همکاران و اطلاعات محرمانه.',skills:['استقلال و صداقت حرفه‌ای','محرمانگی و حفاظت از اسناد','تعارض منافع و حدود پذیرش وکالت','ارتباط حرفه‌ای و پرهیز از وعده نتیجه','مسئولیت انتظامی و مدیریت خطای حرفه‌ای'],actions:[['دوره‌های آموزشی','/courses'],['تالار علمی و گفتگو','/community'],['داشبورد آموزشی','/dashboard']]},
  {id:'assessment',title:'کارگاه سنجش و ارتقای مهارت حرفه‌ای',level:'همه سطوح',courseIds:[],summary:'ارزیابی دانش، تحلیل، نگارش و مهارت‌های عملی و تبدیل نتیجه به برنامه یادگیری.',skills:['آزمون دانش قوانین و مقررات','تحلیل سناریو و پرونده','تمرین نگارش و دفاع','بازخورد بر اساس معیارهای روشن','ثبت پیشرفت و شناسایی نقاط نیازمند تقویت'],actions:[['مرکز آزمون هوشمند','/academy/exams'],['دوره‌های آموزشی','/courses'],['داشبورد من','/dashboard']]},
  {id:'apprenticeship',title:'کارگاه کارآموزی مجازی وکالت',level:'کارآموز وکالت',courseIds:["civil-litigation-practice","evidence-and-proof","legal-writing-workshop","oral-advocacy-workshop"],summary:'مسیر تلفیقی و مرحله‌به‌مرحله برای تمرین گردش کار یک پرونده در محیط آموزشی کنترل‌شده.',skills:['دریافت پرونده فرضی و تشکیل پرونده آموزشی','مصاحبه شبیه‌سازی‌شده و تکمیل چک‌لیست اطلاعات','مطالعه اسناد و استخراج مسائل حقوقی','تنظیم دادخواست یا شکواییه و لوایح','تمرین جلسه رسیدگی و دفاع شفاهی','تحلیل رأی، اقدام بعدی و ثبت در بایگانی آموزشی'],actions:[['بانک پرونده‌های آموزشی','/cases'],['داشبورد و سوابق آموزشی','/dashboard'],['تنظیم اسناد','/assistant/documents'],['شبیه‌ساز دادگاه','/moot-court'],['تقویم مواعد','/deadlines']]},
  {id:'continuous',specialtyTracks:true,title:'کارگاه آموزش ضمن خدمت و به‌روزرسانی وکلا',level:'وکلای دادگستری',courseIds:["continuing-legal-education-workshop"],summary:'یادگیری مستمر و موضوع‌محور با تمرکز بر تحولات قانونی، رویه قضایی و فناوری‌های حرفه‌ای.',skills:['مرور اصلاحات قوانین و مقررات','تحلیل آرای تازه و رویه‌های مهم','بررسی پرونده‌های پیچیده و راهبردهای دفاع','به‌روزرسانی مهارت نگارش و مذاکره','مدیریت دانش و فناوری دفتر وکالت'],actions:[['بانک قوانین و مقررات','/laws'],['رسانه و اندیشه','/media'],['تالار علمی و گفتگو','/community'],['دستیار هوشمند وکیل','/assistant']]}
];

export const EXERCISES = {
 drafting:{title:'تنظیم یک دادخواست کامل',task:'یک پرونده فرضی اختلاف ناشی از عدم اجرای تعهد قراردادی را انتخاب کنید. خواسته و بهای آن را تعیین کنید، وقایع مؤثر را به ترتیب زمانی بنویسید، دلایل را فهرست کنید و برای هر بخش مستند قانونی قابل راستی‌آزمایی بیابید.',rubric:['تناسب خواسته با رابطه حقوقی','تفکیک وقایع از تحلیل و ادعا','کفایت و ارتباط دلایل','صحت و قابلیت راستی‌آزمایی استنادها','وضوح و انسجام نگارش']},
 'case-analysis':{title:'تهیه نقشه راهبرد پرونده',task:'از بانک پرونده‌های آموزشی یک پرونده انتخاب کنید. در یک گزارش کوتاه، وقایع قطعی و مورد اختلاف، ادله هر طرف، مسائل شکلی، مسائل ماهوی، دفاع‌های محتمل و اقدام بعدی را جداگانه ثبت کنید.',rubric:['استخراج درست مسائل','تشخیص خلأهای اطلاعاتی','ارزیابی بی‌طرفانه ادله','پیش‌بینی دفاع طرف مقابل','انتخاب اقدام متناسب و زمان‌بندی‌شده']},
 advocacy:{title:'دفاع شفاهی سه‌دقیقه‌ای',task:'یک پرونده آموزشی را انتخاب و برای آن دفاع شفاهی سه‌دقیقه‌ای آماده کنید: معرفی موضوع، بیان مسئله اصلی، دو استدلال مستند، پاسخ به قوی‌ترین ایراد طرف مقابل و خواسته نهایی.',rubric:['شروع روشن و معرفی دقیق موضوع','اولویت‌بندی استدلال‌ها','استناد مرتبط و دقیق','پاسخ مستقیم به ایراد','بیان حرفه‌ای و رعایت زمان']},
 litigation:{title:'طراحی نقشه مراحل دادرسی',task:'برای یک دعوای فرضی، از ثبت دادخواست تا قطعیت و اجرای رأی، مراحل احتمالی را ترسیم کنید. در هر مرحله مرجع، اقدام، مهلت قانونی و پیامد عدم اقدام را با منبع معتبر مشخص کنید.',rubric:['ترتیب صحیح مراحل','تشخیص مرجع و اقدام','احراز مهلت از منبع معتبر','توجه به ضمانت اجرای عدم اقدام','تفکیک قواعد عمومی از استثناها']},
 contracts:{title:'بازبینی قرارداد و گزارش ریسک',task:'یک قرارداد فرضی خدمات یا پیمانکاری تهیه یا انتخاب کنید. تعهدات طرفین، زمان‌بندی، تضمین‌ها، موارد نقض، شیوه خاتمه و حل اختلاف را بررسی و دست‌کم پنج ریسک را با پیشنهاد اصلاحی بنویسید.',rubric:['شناسایی ابهام‌ها و تعارض‌ها','پوشش تعهدات اصلی','پیش‌بینی ضمانت اجرا','تناسب شروط با موضوع قرارداد','پیشنهاد اصلاح روشن و قابل اجرا']},
 specialties:{title:'تحلیل یک مسئله در حوزه تخصصی',task:'یک موضوع از حوزه مدنی، کیفری، خانواده، تجارت، کار، املاک یا بانکی انتخاب کنید. یک مسئله مشخص را صورت‌بندی و منابع قانونی و قضایی مرتبط را دسته‌بندی کنید؛ سپس راه‌حل‌های قابل دفاع را مقایسه کنید.',rubric:['محدود و دقیق بودن مسئله','تنوع و اعتبار منابع','تفکیک قانون از رویه و نظر','مقایسه استدلال‌های رقیب','نتیجه‌گیری مستدل']},
 office:{title:'شبیه‌سازی پذیرش موکل',task:'برای یک مراجعه فرضی، فرم پذیرش اولیه بسازید: مشخصات ضروری، شرح خواسته، اسناد موجود و مفقود، تعارض منافع، حدود خدمت، حق‌الوکاله، مواعد فوری و روش ارتباط. اطلاعات هویتی واقعی وارد نکنید.',rubric:['پرسش‌های هدفمند و ضروری','شناسایی تعارض منافع','شفافیت حدود خدمات و هزینه','ثبت اسناد و مواعد','رعایت محرمانگی و حداقل‌گرایی داده']},
 'legal-tech':{title:'راستی‌آزمایی پاسخ هوش مصنوعی',task:'یک پرسش حقوقی غیرمحرمانه طرح کنید و از دستیار وکیل کمک بگیرید. پاسخ را به گزاره‌های مستقل تقسیم کنید، هر استناد را در بانک قوانین بررسی کنید و موارد نادرست، ناقص یا نیازمند بررسی بیشتر را علامت بزنید.',rubric:['صورت‌بندی دقیق دستور','تفکیک ادعاها و استنادها','تطبیق با متن معتبر','تشخیص عدم قطعیت و خطا','حفظ محرمانگی اطلاعات']},
 research:{title:'تهیه یادداشت تحقیق حقوقی',task:'یک پرسش حقوقی محدود انتخاب کنید. متن قانون و اصلاحات، آرای وحدت رویه و نظریات مشورتی مرتبط را جست‌وجو کنید و یادداشتی شامل پرسش، منابع، تحلیل و نتیجه تهیه کنید.',rubric:['پرسش پژوهشی روشن','استفاده از منابع قابل اتکا','ارجاع دقیق و قابل پیگیری','تحلیل تعارض یا تفاوت منابع','نتیجه متناسب با مستندات']},
 ethics:{title:'تصمیم‌گیری در موقعیت اخلاق حرفه‌ای',task:'سناریوی فرضی دریافت اطلاعات محرمانه از موکل جدیدی را بررسی کنید که احتمال تعارض با موکل قبلی وجود دارد. اقدامات فوری، حدود بررسی، نحوه حفظ اطلاعات و تصمیم درباره پذیرش کار را توضیح دهید.',rubric:['تشخیص تعارض و ریسک','حفظ محرمانگی','پرهیز از افشای غیرضروری','تصمیم مستقل و مستدل','مستندسازی اقدام حرفه‌ای']},
 assessment:{title:'ارزیابی چندبعدی یک پرونده',task:'یک پرونده آموزشی را انتخاب کنید و سه خروجی مستقل ارائه دهید: تحلیل یک‌صفحه‌ای، پیش‌نویس یک سند قضایی و دفاع شفاهی کوتاه. سپس با معیارهای کارگاه، نقاط قوت و ضعف خود را ارزیابی کنید.',rubric:['دقت تحلیل','کیفیت نگارش سند','انسجام دفاع شفاهی','صحت منابع','خودارزیابی واقع‌بینانه']},
 apprenticeship:{title:'پرونده شبیه‌سازی‌شده از ابتدا تا انتها',task:'یک پرونده منتشرشده آموزشی را انتخاب کنید و مراحل زیر را به ترتیب انجام دهید: تشکیل پرونده آموزشی و ثبت اطلاعات بی‌نام، مصاحبه فرضی با موکل، فهرست اسناد، تحلیل مسائل، تنظیم سند آغازین، آماده‌سازی دفاع، حضور در موت‌کورت، تحلیل رأی و ثبت اقدام بعدی در بایگانی. در هر مرحله خروجی مشخص تولید کنید.',rubric:['کامل بودن گردش کار','پیوند منطقی میان مراحل','کیفیت اسناد و استدلال','عملکرد در جلسه شبیه‌سازی','ثبت مستند اقدامات و مواعد']},
 continuous:{title:'گزارش به‌روزرسانی حرفه‌ای',task:'یک تغییر قانونی یا رأی مهمِ منتشرشده و قابل احراز انتخاب کنید. وضعیت پیشین و جدید، تاریخ اثرگذاری، اشخاص یا دعاوی متأثر و اقدام عملی لازم برای وکیل را در یادداشت کوتاه بیان کنید.',rubric:['احراز اصالت و تاریخ منبع','تشخیص دقیق تغییر','تحلیل اثر عملی','پرهیز از تعمیم بی‌پشتوانه','ارائه پیشنهاد کاربردی']}
};

function el(tag, attrs={}, children=[]) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(key==='text') node.textContent=value;
    else if(key==='class') node.className=value;
    else node.setAttribute(key,String(value));
  }
  for(const child of children) if(child) node.append(child);
  return node;
}
function link(title,path,cls='btn secondary small') {
  return el('a',{class:cls,href:'#'+path,text:title});
}
function workshopCard(item) {
  const card=el('article',{class:'workshop-card'});
  card.append(el('div',{class:'workshop-card-meta'},[
    el('span',{class:'workshop-level',text:item.level}),
    el('span',{class:'workshop-count',text:item.skills.length+' محور تمرینی'})
  ]));
  card.append(el('h2',{text:item.title}),el('p',{text:item.summary}));
  const list=el('ul',{class:'workshop-skill-preview'});
  item.skills.slice(0,3).forEach(skill=>list.append(el('li',{text:skill})));
  card.append(list,link('مشاهده برنامه کارگاه','/academy/workshops/'+item.id,'workshop-open'));
  return card;
}
export async function workshopsPage(id='') {
  const root=el('div',{class:'workshops-page'});
  const current=WORKSHOPS.find(x=>x.id===id);
  if(current) {
    root.append(el('p',{class:'workshop-back'},[link('← همه کارگاه‌ها','/academy/workshops','')]));
    root.append(el('span',{class:'section-kicker',text:'کارگاه آموزشی مهارت‌محور'}),el('h1',{text:current.title}),el('p',{class:'lead',text:current.summary}));
    root.append(el('div',{class:'workshop-level-banner',text:'مخاطب: '+current.level+' · آموزش با تمرین، بازخورد و استفاده از ابزارهای موجود آکادمی'}));
    root.append(el('h2',{text:'سرفصل‌ها و مهارت‌های مورد انتظار'}));
    const skills=el('ol',{class:'workshop-skill-list'});
    current.skills.forEach((skill,i)=>skills.append(el('li',{},[el('strong',{text:'گام '+(i+1)}),el('span',{text:skill})])));
    root.append(skills,el('h2',{text:'ابزارها و بخش‌های مرتبط آکادمی'}));
    const actions=el('div',{class:'workshop-actions'});
    current.actions.forEach(([title,path])=>actions.append(link(title,path)));
    root.append(actions);
    const catalog = await getJson('/api/academy/courses');
    const allCourses = catalog.ok ? (catalog.data.courses || []) : [];
    let tracks = current.specialtyTracks ? allCourses.filter(item => item.id.startsWith('specialty-')).slice(0,8) : allCourses.filter(item => (current.courseIds || []).includes(item.id));
    if (tracks.length) {
      root.append(el('h2',{text:'مسیرهای آموزشی و درس‌های قابل ثبت در کارنامه'}));
      const trackGrid=el('div',{class:'workshop-track-grid'});
      tracks.forEach(track=>{
        const card=el('article',{class:'workshop-track-card'},[
          el('div',{class:'workshop-track-meta'},[
            el('span',{text:track.level || 'کاربردی'}),
            el('span',{text:(track.lessonCount || 0)+' درس'}),
            ...(track.enrolled?[el('span',{class:'workshop-enrolled',text:'ثبت‌نام شده'} )]:[])
          ]),
          el('strong',{text:track.title}),
          el('p',{text:track.summary || 'محتوای آموزشی و تمرین‌های مرحله‌ای'}),
          link(track.enrolled?'ادامه کارگاه و مشاهده کارنامه':'مشاهده درس‌ها و ثبت‌نام','/academy/'+track.id,'workshop-open')
        ]);
        trackGrid.append(card);
      });
      root.append(trackGrid);
      if(current.specialtyTracks) root.append(el('p',{},[link('مشاهده همه مسیرهای تخصصی','/courses')]));
    } else if(current.id==='assessment') {
      root.append(el('h2',{text:'سنجش دانش و مهارت'}),el('p',{text:'برای ارزیابی دانش حقوقی و پاسخ تشریحی مستند، از مرکز آزمون هوشمند استفاده کنید.'}),link('ورود به مرکز آزمون هوشمند','/academy/exams'));
    } else if(!catalog.ok) {
      root.append(el('p',{class:'workshop-note',text:'فهرست درس‌های قابل ثبت‌نام در حال حاضر بارگذاری نشد؛ محتوای معرفی و تمرین این کارگاه در دسترس است.'}));
    }
    const exercise=EXERCISES[current.id];
    if(exercise){
      root.append(el('h2',{text:'تمرین عملی کارگاه'}),el('section',{class:'workshop-exercise'},[
        el('strong',{text:exercise.title}),el('p',{text:exercise.task}),
        el('h3',{text:'معیارهای ارزیابی'}),el('ul',{},exercise.rubric.map(item=>el('li',{text:item})))
      ]));
    }
    root.append(el('div',{class:'workshop-note',text:'تمرین‌ها باید با پرونده‌های آموزشی، فرضی یا اطلاعات کاملاً بی‌نام‌سازی‌شده انجام شوند. این کارگاه جایگزین کارآموزی رسمی، نظارت حرفه‌ای یا تشخیص و اقدام وکیل در پرونده واقعی نیست.'}));
    root.append(el('p',{},[link('بازگشت به فهرست کارگاه‌ها','/academy/workshops')]));
    return root;
  }
  root.append(el('span',{class:'section-kicker',text:'آموزش کاربردی و مهارت‌محور'}),el('h1',{text:'کارگاه‌های آموزشی آکادمی وکالت شهرام مختاری'}));
  root.append(el('p',{class:'lead',text:'از مبانی حقوقی تا مهارت‌های روزمره وکالت؛ مسیرهایی برای دانشجویان حقوق، کارآموزان وکالت و وکلای دادگستری. هر کارگاه به تمرین و ابزارهای موجود آکادمی متصل است تا آموزش در صفحات پراکنده گم نشود.'}));
  const intro=el('div',{class:'workshop-intro'});
  intro.append(el('strong',{text:'روش آموزش'}),el('p',{text:'مطالعه مبانی ← تحلیل پرونده آموزشی ← انجام تمرین ← دریافت بازخورد ← سنجش و ثبت پیشرفت'}));
  root.append(intro);
  const catalog = await getJson('/api/academy/courses');
  const courseRows = catalog.ok ? (catalog.data.courses || []) : [];
  const linkedIds = new Set(WORKSHOPS.flatMap(item=>item.courseIds || []));
  const publishedLinked = courseRows.filter(item=>linkedIds.has(item.id) && item.status==='published');
  const enrolledCount = publishedLinked.filter(item=>item.enrolled).length;
  root.append(el('div',{class:'workshop-overview-metrics'},[
    el('article',{},[el('strong',{text:String(WORKSHOPS.length)}),el('span',{text:'مسیر مهارت‌محور'})]),
    el('article',{},[el('strong',{text:String(publishedLinked.length)}),el('span',{text:'کارگاه دارای محتوای تعاملی'})]),
    el('article',{},[el('strong',{text:String(enrolledCount)}),el('span',{text:'ثبت‌نام فعال شما'})])
  ]));
  const search=el('input',{type:'search',placeholder:'جست‌وجو در عنوان و مهارت کارگاه‌ها…','aria-label':'جست‌وجو در کارگاه‌ها'});
  const filters=el('div',{class:'workshop-filters'});
  const select=el('select',{'aria-label':'فیلتر بر اساس مخاطب'},[
    el('option',{value:'all',text:'همه مخاطبان'}),el('option',{value:'دانشجو',text:'دانشجوی حقوق'}),el('option',{value:'کارآموز',text:'کارآموز وکالت'}),el('option',{value:'وکیل',text:'وکلای دادگستری'})
  ]);
  filters.append(search,select);root.append(filters);
  const grid=el('div',{class:'workshop-grid'});
  root.append(grid);
  const render=()=>{
    const q=search.value.trim().toLocaleLowerCase('fa');
    const level=select.value;
    const matches=WORKSHOPS.filter(item=>(level==='all'||item.level.includes(level))&&(!q||[item.title,item.summary,item.level,...item.skills].join(' ').toLocaleLowerCase('fa').includes(q)));
    grid.replaceChildren(...(matches.length?matches.map(workshopCard):[el('p',{class:'workshop-empty',text:'کارگاهی با این عبارت پیدا نشد.'})]));
  };
  search.addEventListener('input',render);select.addEventListener('change',render);render();
  root.append(el('h2',{text:'مسیر رشد حرفه‌ای'}),el('div',{class:'workshop-pathway'},[
    ...[
      ['دانشجوی حقوق','مبانی، تحقیق و تحلیل مسئله',['research','drafting','litigation','specialties']],
      ['داوطلب ورود به حرفه','آمادگی علمی، آزمون و مهارت‌های پایه',['research','assessment','specialties']],
      ['کارآموز وکالت','پرونده‌خوانی، نگارش، دفاع و اخلاق حرفه‌ای',['apprenticeship','case-analysis','drafting','advocacy','ethics']],
      ['وکیل جوان','مدیریت دفتر، قرارداد و فناوری حقوقی',['office','contracts','legal-tech','advocacy']],
      ['وکیل دادگستری','آموزش ضمن خدمت و توسعه تخصصی',['continuous','specialties','ethics','legal-tech']]
    ].map(([title,desc,ids],i)=>el('article',{class:'workshop-stage'},[
      el('span',{text:'مرحله '+(i+1)}),el('strong',{text:title}),el('p',{text:desc}),
      el('div',{class:'workshop-stage-links'},ids.map(id=>{const item=WORKSHOPS.find(w=>w.id===id);return item?link(item.title,'/academy/workshops/'+id,''):null;}))
    ]))
  ]));
  root.append(el('div',{class:'workshop-note',text:'سوابق ثبت‌نام و پیشرفت دوره‌های فعلی در بخش دوره‌های آموزشی و داشبورد کاربر نگهداری می‌شود. گواهی‌های این سامانه صرفاً گواهی شرکت یا اتمام آموزش آکادمی هستند و جایگزین گواهی‌های رسمی کارآموزی یا صلاحیت حرفه‌ای نیستند.'}));
  return root;
}
