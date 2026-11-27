// کارگاه‌های مهارت‌محور آکادمی؛ از ابزارها و زیرسامانه‌های موجود استفاده می‌کند.
const WORKSHOPS = [
  {id:'drafting',title:'کارگاه تنظیم حرفه‌ای اسناد قضایی',level:'دانشجو تا وکیل',summary:'تمرین ساختاردهی، خواسته‌نویسی، شرح ماوقع، استدلال و استناد در اسناد قضایی.',skills:['دادخواست و تعیین خواسته','شکواییه و تحلیل عنوان اتهامی','لوایح دفاعیه و پاسخ به ایرادات','اظهارنامه، اعتراض به نظریه کارشناسی و درخواست‌های اجرایی','بازبینی نگارشی و کنترل استنادها'],actions:[['آزمایشگاه دستیار وکیل','/assistant/documents'],['بانک پرونده‌های آموزشی','/cases'],['بانک قوانین و مقررات','/laws']]},
  {id:'case-analysis',title:'کارگاه تحلیل پرونده از پذیرش تا اجرای رأی',level:'کارآموز تا وکیل',summary:'یادگیری روش حرفه‌ای خواندن پرونده، کشف مسائل، تعیین راهبرد و پیگیری مراحل رسیدگی.',skills:['مصاحبه اولیه و استخراج واقعیت‌های مؤثر','فهرست‌برداری و ارزیابی ادله','تشخیص خواسته، دعوا و ایرادات شکلی','طراحی راهبرد و پیش‌بینی دفاع طرف مقابل','تحلیل رأی، اعتراض و اجرای حکم'],actions:[['بانک پرونده‌های آموزشی','/cases'],['مدیریت پرونده‌ها و بایگانی','/casework'],['دستیار هوشمند وکیل','/assistant']]},
  {id:'advocacy',title:'کارگاه فن دفاع، مذاکره و حضور در دادگاه',level:'کارآموز تا وکیل',summary:'تمرین دفاع شفاهی، پاسخ به پرسش‌های قاضی، مواجهه با دفاع طرف مقابل و مذاکره حقوقی.',skills:['ساختار دفاع شفاهی کوتاه و مستند','پاسخ به پرسش و ایراد قاضی','طرح پرسش از شاهد و کارشناس','مدیریت تنش و رعایت شأن حرفه‌ای','مذاکره، سازش و تنظیم توافق'],actions:[['شبیه‌ساز دادگاه و موت‌کورت','/moot-court'],['بانک پرونده‌های آموزشی','/cases'],['کارگاه تنظیم اسناد','/assistant/documents']]},
  {id:'litigation',title:'کارگاه آیین دادرسی و مدیریت جریان دعوا',level:'دانشجو تا وکیل',summary:'آموزش عملی تشخیص مسیر رسیدگی و انتخاب اقدام مناسب در هر مرحله.',skills:['صلاحیت و ارجاع پرونده','ابلاغ، مواعد و اقدامات مقدماتی','ایرادات، تأمین خواسته و دستور موقت','تجدیدنظر، فرجام، واخواهی و اعاده دادرسی','اجرای احکام و پیگیری عملیات اجرایی'],actions:[['تقویم مواعد','/deadlines'],['محاسبه‌گرهای حقوقی','/calculators'],['بانک قوانین و مقررات','/laws']]},
  {id:'contracts',title:'کارگاه تنظیم، تحلیل و مذاکره قراردادها',level:'دانشجو تا وکیل',summary:'تمرین طراحی قرارداد متناسب با هدف طرفین، کنترل ریسک و مدیریت اختلافات قراردادی.',skills:['شناسایی قصد و موضوع قرارداد','تعهدات، شروط، تضمین‌ها و وجه التزام','فسخ، انفساخ، اقاله و آثار نقض تعهد','مسئولیت، فورس‌ماژور و حل اختلاف','بازبینی قرارداد و تهیه چک‌لیست ریسک'],actions:[['دستیار تنظیم اسناد','/assistant/documents'],['دستیار هوشمند وکیل','/assistant'],['بانک قوانین و مقررات','/laws']]},
  {id:'specialties',title:'کارگاه‌های تخصصی حوزه‌های حقوقی',level:'کارآموز تا وکیل',summary:'مسیرهای موضوعی برای تعمیق مهارت در دعاوی مدنی، کیفری، خانواده، تجارت، کار، املاک و بانکداری.',skills:['مدنی: مالکیت، تعهدات و مسئولیت مدنی','کیفری: جرایم مالی و ادله اثبات','خانواده: دعاوی و اجرای احکام','تجارت و شرکت‌ها: اسناد تجاری و اختلافات شرکا','کار، تأمین اجتماعی، املاک، ثبت، بانکی و مالیاتی'],actions:[['دوره‌های آموزشی','/courses'],['بانک پرونده‌های آموزشی','/cases'],['بانک قوانین و مقررات','/laws']]},
  {id:'office',title:'کارگاه مدیریت دفتر وکالت و ارتباط با موکل',level:'وکیل جوان تا حرفه‌ای',summary:'مهارت‌های اداره دفتر، پذیرش پرونده، تنظیم توافق مالی و نگهداری امن اسناد.',skills:['فرایند پذیرش و احراز تعارض منافع','قرارداد حق‌الوکاله و شفاف‌سازی خدمات','مدیریت ارتباط و انتظارات موکل','ساختاردهی پرونده و بایگانی اسناد','کنترل مواعد، پیگیری‌ها و گردش کار دفتر'],actions:[['مدیریت پرونده‌ها و بایگانی','/casework'],['تقویم مواعد','/deadlines'],['محاسبه‌گر حق‌الوکاله','/calculators/attorney']]},
  {id:'legal-tech',title:'کارگاه فناوری حقوقی و هوش مصنوعی',level:'همه سطوح',summary:'استفاده مسئولانه از ابزارهای دیجیتال برای تحقیق، نگارش، تحلیل و مدیریت کار حقوقی.',skills:['جست‌وجوی هدفمند در منابع حقوقی','کار با دستیار وکیل و تنظیم دستور دقیق','راستی‌آزمایی مواد قانونی و آرای قضایی','حفاظت از محرمانگی و داده‌های موکل','تشخیص خطا، توهم و محدودیت خروجی هوش مصنوعی'],actions:[['دستیار هوشمند وکیل','/assistant'],['بانک قوانین و مقررات','/laws'],['تایپ صوتی','/voice-typing']]},
  {id:'research',title:'کارگاه تحقیق و استدلال حقوقی',level:'دانشجو تا وکیل',summary:'تبدیل پرسش حقوقی به تحقیق مستند و استدلال قابل دفاع.',skills:['صورت‌بندی مسئله و پرسش پژوهش','یافتن متن معتبر قانون و اصلاحات','جست‌وجوی رأی وحدت رویه و نظریه مشورتی','تفکیک منبع رسمی، ثانویه و آموزشی','ساخت زنجیره استدلال و ارجاع دقیق'],actions:[['بانک قوانین و مقررات','/laws'],['دستیار هوشمند وکیل','/assistant'],['رسانه و اندیشه','/media']]},
  {id:'ethics',title:'کارگاه اخلاق، مسئولیت و شئون حرفه‌ای',level:'کارآموز تا وکیل',summary:'تمرین تصمیم‌گیری مسئولانه در رابطه با موکل، دادگاه، همکاران و اطلاعات محرمانه.',skills:['استقلال و صداقت حرفه‌ای','محرمانگی و حفاظت از اسناد','تعارض منافع و حدود پذیرش وکالت','ارتباط حرفه‌ای و پرهیز از وعده نتیجه','مسئولیت انتظامی و مدیریت خطای حرفه‌ای'],actions:[['دوره‌های آموزشی','/courses'],['تالار علمی و گفتگو','/community'],['داشبورد آموزشی','/dashboard']]},
  {id:'assessment',title:'کارگاه سنجش و ارتقای مهارت حرفه‌ای',level:'همه سطوح',summary:'ارزیابی دانش، تحلیل، نگارش و مهارت‌های عملی و تبدیل نتیجه به برنامه یادگیری.',skills:['آزمون دانش قوانین و مقررات','تحلیل سناریو و پرونده','تمرین نگارش و دفاع','بازخورد بر اساس معیارهای روشن','ثبت پیشرفت و شناسایی نقاط نیازمند تقویت'],actions:[['مرکز آزمون هوشمند','/academy/exams'],['دوره‌های آموزشی','/courses'],['داشبورد من','/dashboard']]},
  {id:'apprenticeship',title:'کارگاه کارآموزی مجازی وکالت',level:'کارآموز وکالت',summary:'مسیر تلفیقی و مرحله‌به‌مرحله برای تمرین گردش کار یک پرونده در محیط آموزشی کنترل‌شده.',skills:['دریافت پرونده فرضی و تشکیل پرونده آموزشی','مصاحبه شبیه‌سازی‌شده و تکمیل چک‌لیست اطلاعات','مطالعه اسناد و استخراج مسائل حقوقی','تنظیم دادخواست یا شکواییه و لوایح','تمرین جلسه رسیدگی و دفاع شفاهی','تحلیل رأی، اقدام بعدی و ثبت در بایگانی آموزشی'],actions:[['بانک پرونده‌های آموزشی','/cases'],['مدیریت پرونده‌ها و بایگانی','/casework'],['تنظیم اسناد','/assistant/documents'],['شبیه‌ساز دادگاه','/moot-court'],['تقویم مواعد','/deadlines']]},
  {id:'continuous',title:'کارگاه آموزش ضمن خدمت و به‌روزرسانی وکلا',level:'وکلای دادگستری',summary:'یادگیری مستمر و موضوع‌محور با تمرکز بر تحولات قانونی، رویه قضایی و فناوری‌های حرفه‌ای.',skills:['مرور اصلاحات قوانین و مقررات','تحلیل آرای تازه و رویه‌های مهم','بررسی پرونده‌های پیچیده و راهبردهای دفاع','به‌روزرسانی مهارت نگارش و مذاکره','مدیریت دانش و فناوری دفتر وکالت'],actions:[['بانک قوانین و مقررات','/laws'],['رسانه و اندیشه','/media'],['تالار علمی و گفتگو','/community'],['دستیار هوشمند وکیل','/assistant']]}
];

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
export function workshopsPage(id='') {
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
    root.append(el('div',{class:'workshop-note',text:'تمرین‌ها باید با پرونده‌های آموزشی، فرضی یا اطلاعات کاملاً بی‌نام‌سازی‌شده انجام شوند. این کارگاه جایگزین کارآموزی رسمی، نظارت حرفه‌ای یا تشخیص و اقدام وکیل در پرونده واقعی نیست.'}));
    root.append(el('p',{},[link('بازگشت به فهرست کارگاه‌ها','/academy/workshops')]));
    return root;
  }
  root.append(el('span',{class:'section-kicker',text:'آموزش کاربردی و مهارت‌محور'}),el('h1',{text:'کارگاه‌های آموزشی آکادمی وکالت شهرام مختاری'}));
  root.append(el('p',{class:'lead',text:'از مبانی حقوقی تا مهارت‌های روزمره وکالت؛ مسیرهایی برای دانشجویان حقوق، کارآموزان وکالت و وکلای دادگستری. هر کارگاه به تمرین و ابزارهای موجود آکادمی متصل است تا آموزش در صفحات پراکنده گم نشود.'}));
  const intro=el('div',{class:'workshop-intro'});
  intro.append(el('strong',{text:'روش آموزش'}),el('p',{text:'مطالعه مبانی ← تحلیل پرونده آموزشی ← انجام تمرین ← دریافت بازخورد ← سنجش و ثبت پیشرفت'}));
  root.append(intro);
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
    ...[['دانشجوی حقوق','مبانی، تحقیق و تحلیل مسئله'],['داوطلب ورود به حرفه','آمادگی علمی و آزمون'],['کارآموز وکالت','تنظیم اسناد، پرونده‌خوانی و دفاع'],['وکیل جوان','مدیریت دفتر و انتخاب حوزه تخصصی'],['وکیل دادگستری','آموزش ضمن خدمت و توسعه حرفه‌ای']].map(([title,desc],i)=>el('article',{class:'workshop-stage'},[el('span',{text:'مرحله '+(i+1)}),el('strong',{text:title}),el('p',{text:desc})]))
  ]));
  root.append(el('div',{class:'workshop-note',text:'سوابق ثبت‌نام و پیشرفت دوره‌های فعلی در بخش دوره‌های آموزشی و داشبورد کاربر نگهداری می‌شود. گواهی‌های این سامانه صرفاً گواهی شرکت یا اتمام آموزش آکادمی هستند و جایگزین گواهی‌های رسمی کارآموزی یا صلاحیت حرفه‌ای نیستند.'}));
  return root;
}
