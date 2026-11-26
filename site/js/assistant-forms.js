import { h } from './dom.js';
import { icon } from './icons.js';
import { getJson, postJson } from './api.js';
import { aiStatus, errorText } from './ai-client.js';
import { CONTRACT_TYPES, ASSISTANT_NOTICE } from './assistant-config.js';

const DOCS = [
 ['petition','دادخواست','file-text','تنظیم دادخواست حقوقی، خواسته و دلایل'],
 ['defense','لایحه دفاعیه','shield-check','پاسخ مستدل به ادعاهای طرف مقابل'],
 ['appeal','تجدیدنظرخواهی','scale','اعتراض به رأی و بیان جهات تجدیدنظر'],
 ['cassation','فرجام‌خواهی','landmark','درخواست و لایحه فرجامی'],
 ['enforcement','درخواست اجرایی','gavel','درخواست‌های اجرای احکام و عملیات اجرایی'],
 ['notice','اظهارنامه','file-text','اعلام رسمی مطالبه، اخطار یا اراده'],
 ['criminal_complaint','شکواییه کیفری','gavel','شرح واقعه، طرفین و ادله شکایت'],
 ['reply','پاسخ به سند طرف مقابل','edit','پاسخ به دادخواست، لایحه یا دفاعیات'],
 ['retrial','اعاده دادرسی','scale','بررسی جهات قانونی اعاده دادرسی و دلایل جدید'],
 ['third_party','اعتراض ثالث','gavel','حمایت از حق شخص ثالث متأثر از رأی'],
 ['opposition','واخواهی','file-text','اعتراض به حکم غیابی و بررسی عذر عدم حضور'],
 ['counterclaim','دعوای متقابل','clipboard-list','تنظیم دعوای متقابل مرتبط با دعوای اصلی'],
 ['execution_objection','اعتراض اجرایی','shield-check','اعتراض به اجرائیه یا عملیات اجرایی'],
 ['jurisdiction','ایراد صلاحیت','landmark','بررسی صلاحیت ذاتی و محلی مرجع رسیدگی'],
 ['evidence_request','درخواست ادله','file-search','تأمین دلیل، مطالبه سند یا درخواست ارائه دلیل'],
 ['judicial_request','درخواست قضایی','clipboard-list','درخواست متناسب با موضوع پرونده'],
 ['letter','نامه حقوقی','file-text','مکاتبه رسمی با اشخاص و مراجع'],
 ['other','سایر اسناد','folder','تنظیم یا تحلیل سند با قالب اختصاصی']
];
export const ASSISTANT_DOCUMENT_IDS = Object.freeze(DOCS.map(([id]) => id));

// هر فیلد: [نام، عنوان، نوع کنترل، ضروری]
const SCHEMAS = {
 petition: ['دادخواست حقوقی', [
  ['court','مرجع قضایی و شعبه','text',false],['plaintiff','خواهان / خواهان‌ها و نشانی','area',true],
  ['defendant','خوانده / خواندگان و نشانی','area',true],['claim','خواسته و بهای آن','area',true],
  ['facts','شرح وقایع به ترتیب زمانی','area',true],['law','مبانی و مستندات قانونی موردنظر','area',false],
  ['evidence','دلایل و منضمات','area',false],['requests','درخواست‌های تبعی مانند خسارت و هزینه دادرسی','area',false]
 ]],
 defense: ['لایحه دفاعیه', [
  ['court','مرجع رسیدگی و شعبه','text',true],['case','شماره پرونده و کلاسه','text',false],
  ['client','موکل و سمت او در پرونده','area',true],['opponent','طرف مقابل و خواسته یا اتهام او','area',true],
  ['claims','ادعاهای طرف مقابل','area',true],['defenses','دفاعیات و پاسخ به هر ادعا','area',true],
  ['evidence','دلایل و مستندات دفاع','area',false],['requests','نتیجه و خواسته از دادگاه','area',false]
 ]],
 appeal: ['لایحه تجدیدنظرخواهی', [
  ['court','دادگاه صادرکننده رأی و مرجع تجدیدنظر','text',true],['parties','تجدیدنظرخواه و تجدیدنظرخوانده','area',true],
  ['judgment','شماره و تاریخ دادنامه و تاریخ ابلاغ','area',true],['subject','موضوع دعوا و خلاصه نتیجه رأی','area',true],
  ['grounds','جهات و دلایل تجدیدنظرخواهی','area',true],['evidence','مدارک و مستندات','area',false],['requests','خواسته از دادگاه تجدیدنظر','area',true]
 ]],
 cassation: ['لایحه فرجام‌خواهی', [
  ['court','مرجع صادرکننده رأی و مرجع فرجامی','text',true],['parties','فرجام‌خواه و فرجام‌خوانده','area',true],
  ['judgment','مشخصات دادنامه و تاریخ ابلاغ','area',true],['history','خلاصه جریان دادرسی','area',false],
  ['grounds','جهات فرجام‌خواهی و ایرادات قانونی','area',true],['requests','درخواست نهایی','area',true]
 ]],
 enforcement: ['درخواست اجرایی', [
  ['authority','واحد اجرا، شعبه و مرجع مربوط','text',true],['parties','محکوم‌له و محکوم‌علیه یا متقاضیان','area',true],
  ['execution','شماره پرونده اجرایی، اجراییه و تاریخ‌ها','area',false],['subject','موضوع و وضعیت فعلی اجرا','area',true],
  ['request','اقدام مشخص مورد تقاضا','area',true],['documents','مدارک پیوست','area',false]
 ]],
 notice: ['اظهارنامه', [
  ['sender','اظهارکننده و نشانی','area',true],['recipient','مخاطب و نشانی','area',true],
  ['subject','موضوع اظهارنامه','text',true],['facts','شرح رابطه و وقایع مرتبط','area',true],
  ['demand','مطالبه یا اقدام مورد درخواست','area',true],['deadline','مهلت انجام یا پاسخ','text',false]
 ]],
 criminal_complaint: ['شکواییه کیفری', [
  ['complainant','شاکی و مشخصات تماس','area',true],['accused','مشتکی‌عنه (در صورت شناسایی)','area',false],
  ['incident','زمان، مکان و نحوه وقوع واقعه','area',true],['loss','ضرر و زیان یا نتیجه واقعه','area',false],
  ['evidence','شهود، مدارک، گزارش‌ها و ادله','area',true],['requests','درخواست از مرجع قضایی','area',false]
 ]],
 reply: ['پاسخ به سند طرف مقابل', [
  ['court','مرجع رسیدگی و شماره پرونده','text',false],['document','نوع سند و تاریخ ارائه آن','text',true],
  ['opponent','طرف ارائه‌کننده و ادعاهای او','area',true],['responses','پاسخ به هر ادعا یا بند','area',true],
  ['evidence','مستندات و دلایل پاسخ','area',false],['requests','درخواست نهایی','area',false]
 ]],
 retrial: ['دادخواست یا لایحه اعاده دادرسی', [
  ['court','مرجع صادرکننده رأی و مرجع رسیدگی به اعاده دادرسی','text',true],
  ['judgment','شماره، تاریخ و قطعیت رأی مورد درخواست','area',true],
  ['parties','طرفین رأی و سمت متقاضی','area',true],
  ['ground','جهت قانونی مورد استناد برای اعاده دادرسی','area',true],
  ['discovery','زمان و نحوه اطلاع از جهت یا دلیل مورد استناد','area',false],
  ['facts','شرح دقیق وقایع و انطباق آن با جهت قانونی ادعایی','area',true],
  ['evidence','اسناد و مدارک پشتیبان و زمان تحصیل آن‌ها','area',true],
  ['requests','خواسته و درخواست نهایی','area',true]
 ]],
 third_party: ['دادخواست یا لایحه اعتراض ثالث', [
  ['court','مرجع صادرکننده رأی و مرجع رسیدگی','text',true],
  ['judgment','مشخصات رأی مورد اعتراض و تاریخ ابلاغ یا اطلاع','area',true],
  ['parties','طرفین دعوای اصلی و مشخصات معترض ثالث','area',true],
  ['right','حق یا منفعت مستقل معترض ثالث','area',true],
  ['impact','نحوه تأثیر رأی بر حق معترض و وجه ورود ضرر','area',true],
  ['grounds','جهات و مبانی اعتراض ثالث','area',true],
  ['evidence','اسناد و مدارک اثبات حق ثالث','area',true],
  ['requests','خواسته و آثار مورد درخواست','area',true]
 ]],
 opposition: ['دادخواست یا لایحه واخواهی', [
  ['court','دادگاه صادرکننده حکم غیابی','text',true],
  ['judgment','شماره، تاریخ و مفاد حکم و وضعیت ابلاغ','area',true],
  ['parties','واخواه و واخوانده و سمت آن‌ها','area',true],
  ['absence','علت عدم حضور یا عدم اطلاع از جریان دادرسی','area',false],
  ['service','نحوه و تاریخ ابلاغ و زمان اطلاع واقعی','area',true],
  ['grounds','ایرادات شکلی و ماهوی نسبت به حکم','area',true],
  ['evidence','دلایل و مستندات واخواهی','area',false],
  ['requests','درخواست نهایی','area',true]
 ]],
 counterclaim: ['دادخواست دعوای متقابل', [
  ['court','مرجع رسیدگی به دعوای اصلی','text',true],
  ['case','شماره پرونده و مرحله رسیدگی دعوای اصلی','text',true],
  ['parties','خواهان و خوانده دعوای اصلی و سمت آن‌ها در دعوای متقابل','area',true],
  ['original','خواسته و سبب دعوای اصلی','area',true],
  ['counterclaim','خواسته و سبب دعوای متقابل','area',true],
  ['connection','ارتباط کامل یا منشأ مشترک دو دعوا','area',true],
  ['evidence','دلایل و مستندات دعوای متقابل','area',false],
  ['requests','خواسته نهایی و تقاضای رسیدگی توأمان','area',true]
 ]],
 execution_objection: ['اعتراض به اجرائیه یا عملیات اجرایی', [
  ['authority','واحد اجرا، شعبه و مرجع مربوط','text',true],
  ['judgment','مشخصات حکم، اجرائیه و پرونده اجرایی','area',true],
  ['parties','محکوم‌له، محکوم‌علیه و معترض','area',true],
  ['operation','اقدام یا عملیات اجرایی مورد اعتراض','area',true],
  ['date','تاریخ ابلاغ یا اطلاع از اقدام مورد اعتراض','text',false],
  ['grounds','جهات و مبانی اعتراض و ایرادهای اجرایی','area',true],
  ['evidence','دلایل و مستندات اعتراض','area',false],
  ['requests','اقدام مورد تقاضا از مرجع اجرا یا دادگاه','area',true]
 ]],
 jurisdiction: ['ایراد عدم صلاحیت', [
  ['court','مرجع فعلی رسیدگی و شعبه','text',true],
  ['claim','خواسته و موضوع دعوا','area',true],
  ['facts','اقامتگاه طرفین و محل وقوع یا اجرای تعهد','area',false],
  ['jurisdiction','نوع صلاحیت مورد ایراد: ذاتی یا محلی','text',true],
  ['grounds','مبانی قانونی و دلایل عدم صلاحیت','area',true],
  ['alternative','مرجع صالح مورد ادعا و مبنای آن','area',false],
  ['requests','درخواست صدور قرار مقتضی و ارسال پرونده در صورت لزوم','area',true]
 ]],
 evidence_request: ['درخواست تأمین دلیل یا مطالبه دلیل', [
  ['authority','مرجع صالح و حوزه مربوط','text',true],
  ['subject','موضوع دلیل یا سند مورد درخواست','area',true],
  ['facts','وقایع و وضعیت موجود و علت نیاز به دلیل','area',true],
  ['urgency','فوریت و خطر از بین رفتن یا دشوارشدن دسترسی به دلیل','area',false],
  ['evidence','نوع دلیل، سند، معاینه، تحقیق یا کارشناسی مورد تقاضا','area',true],
  ['holder','شخص یا مرجعی که سند یا دلیل نزد اوست','area',false],
  ['requests','درخواست مشخص و حدود اقدام مورد تقاضا','area',true]
 ]],
 judicial_request: ['درخواست قضایی', [
  ['authority','مرجع قضایی و شعبه','text',true],['parties','اشخاص مرتبط و سمت آن‌ها','area',false],
  ['case','شماره پرونده و مرحله رسیدگی','text',false],['subject','موضوع درخواست','text',true],
  ['reasons','دلایل و مبانی درخواست','area',true],['documents','مدارک پیوست','area',false]
 ]],
 letter: ['نامه حقوقی', [
  ['recipient','مخاطب و سمت او','area',true],['sender','فرستنده و سمت','area',true],
  ['subject','موضوع نامه','text',true],['background','سوابق و توضیحات لازم','area',false],
  ['request','درخواست یا نتیجه مورد انتظار','area',true]
 ]],
 other: ['سند حقوقی اختصاصی', [
  ['document','نوع سند موردنظر','text',true],['parties','اشخاص و سمت آن‌ها','area',false],
  ['subject','موضوع سند','area',true],['terms','شرایط و مفاد موردنظر','area',true],
  ['notes','توضیحات تکمیلی و مستندات','area',false]
 ]]
};

const CONTRACT_EXTRA = {
 lease: [['property','مشخصات کامل ملک، پلاک ثبتی و امکانات','area',true],['deposit','مبلغ ودیعه و اجاره‌بها','area',true],['delivery','شرایط تحویل و تخلیه','area',false]],
 real_estate_sale: [['property','مشخصات ثبتی، نشانی و وضعیت ملک','area',true],['title','وضعیت سند، بازداشت، رهن و حقوق ثالث','area',false],['transfer','زمان و دفترخانه انتقال سند','area',true]],
 vehicle_sale: [['vehicle','نوع، مدل، سال، رنگ، شماره شاسی و موتور','area',true],['delivery','تحویل، تعویض پلاک و خلافی','area',false]],
 construction: [['land','مشخصات زمین و مالکیت','area',true],['shares','قدرالسهم طرفین و تقسیم واحدها','area',true],['schedule','مراحل ساخت و زمان‌بندی','area',true]],
 employment: [['job','عنوان شغل، محل کار و شرح وظایف','area',true],['hours','ساعات کار و مرخصی','area',false],['benefits','حقوق، مزایا و بیمه','area',true]],
 nda: [['confidential','تعریف اطلاعات محرمانه و استثناها','area',true],['purpose','هدف افشا و اشخاص مجاز','area',false],['survival','مدت تعهد پس از خاتمه','area',false]],
 software: [['deliverables','خروجی‌ها و معیار پذیرش','area',true],['ownership','مالکیت کد، داده و حقوق فکری','area',true],['support','پشتیبانی، امنیت و سطح خدمات','area',false]],
 loan: [['repayment','سررسیدها و برنامه بازپرداخت','area',true],['security','وثایق و تضمین بازپرداخت','area',false]],
 supply: [['goods','مشخصات، تعداد و استاندارد کالا','area',true],['inspection','کنترل کیفیت و تحویل','area',false]],
 consulting: [['scope','شرح خدمات و خروجی‌های قابل تحویل','area',true],['acceptance','نحوه تأیید خدمات و گزارش‌دهی','area',false]]
};
export const ASSISTANT_CONTRACT_FORM_IDS = Object.freeze(Object.keys(CONTRACT_EXTRA));
const CONTRACT_BASE = [
 ['partyA','طرف اول: نام، مشخصات و نشانی','area',true],['partyB','طرف دوم: نام، مشخصات و نشانی','area',true],
 ['subject','موضوع و حدود دقیق قرارداد','area',true],['price','مبلغ، عوض یا آورده و شیوه پرداخت','area',true],
 ['duties','تعهدات هر یک از طرفین','area',true],['term','مدت و تاریخ شروع و پایان','text',true],
 ['guarantees','ضمانت اجرا، خسارت و تضمین‌ها','area',false],['termination','شرایط فسخ، خاتمه و آثار آن','area',false],
 ['disputes','روش حل اختلاف و مرجع صالح','area',false],['special','شرایط اختصاصی و توضیحات تکمیلی','area',false]
];

function fieldNode(field) {
 const name=field[0], label=field[1], kind=field[2], required=field[3];
 const control=kind==='area'
  ? h('textarea',{name,rows:'3',...(required?{required:''}:{}),placeholder:'اطلاعات مربوط به این بخش را وارد کنید.'})
  : h('input',{name,type:'text',...(required?{required:''}:{}),placeholder:'وارد کنید'});
 return h('div',{class:'field assistant-form-field'},[h('label',{text:label}),control]);
}
function formSection(title, description, fields) {
 return h('section',{class:'assistant-form-section'},[
  h('h2',{text:title}),description?h('p',{class:'muted',text:description}):null,
  h('div',{class:'assistant-form-grid'},fields.map(fieldNode))
 ].filter(Boolean));
}
function card(doc) {
 return h('a',{class:'assistant-document-card',href:'#/assistant/doc/'+doc[0]},[
  h('span',{class:'assistant-document-icon'},[icon(doc[2],{size:22})]),
  h('span',{class:'assistant-document-copy'},[h('strong',{text:doc[1]}),h('small',{text:doc[3]})]),
  icon('arrow-left',{size:18})
 ]);
}

export function assistantMenuPage() {
 return h('div',{class:'assistant assistant-document-menu'},[
  h('span',{class:'section-kicker',text:'آکادمی وکالت شهرام مختاری'}),
  h('h1',{text:'دستیار هوشمند وکیل'}),
  h('p',{class:'muted',text:'بخش موردنظر را انتخاب کنید؛ هر بخش گردش‌کار و ابزارهای متناسب خود را دارد.'}),
  h('section',{class:'assistant-menu-section'},[
   h('a',{class:'assistant-document-card assistant-consult-card',href:'#/assistant/consult'},[
    h('span',{class:'assistant-document-icon'},[icon('scale',{size:22})]),
    h('span',{class:'assistant-document-copy'},[h('strong',{text:'مشاوره حقوقی هوشمند'}),h('small',{text:'پرسش حقوقی، تحلیل و گفت‌وگوی متنی یا صوتی'})]),
    icon('arrow-left',{size:18})
   ]),
   h('a',{class:'assistant-document-card',href:'#/assistant/documents'},[
    h('span',{class:'assistant-document-icon'},[icon('file-text',{size:22})]),
    h('span',{class:'assistant-document-copy'},[h('strong',{text:'تنظیم اسناد'}),h('small',{text:'دادخواست، لایحه، وکالت‌نامه و قراردادها'})]),
    icon('arrow-left',{size:18})
   ]),
   h('a',{class:'assistant-document-card',href:'#/assistant/litigation'},[
    h('span',{class:'assistant-document-icon'},[icon('gavel',{size:22})]),
    h('span',{class:'assistant-document-copy'},[h('strong',{text:'میز محاکمه هوشمند'}),h('small',{text:'دفاع طرف مقابل، پاسخ وکیل موکل و ارزیابی بی‌طرفانه قاضی'})]),
    icon('arrow-left',{size:18})
   ]),
   h('a',{class:'assistant-document-card',href:'#/assistant/research'},[
    h('span',{class:'assistant-document-icon'},[icon('book-open-check',{size:22})]),
    h('span',{class:'assistant-document-copy'},[h('strong',{text:'تحقیق و راستی‌آزمایی حقوقی'}),h('small',{text:'بررسی مواد قانونی، انطباق استنادها و خلأهای تحقیق'})]),
    icon('arrow-left',{size:18})
   ])
  ]),
  h('p',{class:'ai-history-link'},[h('a',{href:'#/assistant/history',text:'مشاهده سوابق گفت‌وگوها ←'})]),
  h('details',{class:'ai-notice'},[h('summary',{text:'ملاحظات استفاده از دستیار'}),h('p',{class:'muted',text:ASSISTANT_NOTICE})])
 ]);
}

/** صفحهٔ تنظیم اسناد: فهرست اسناد و قراردادها و سوابق. */
export function assistantDocumentsMenuPage() {
 const docs=DOCS.map(card);
 return h('div',{class:'assistant assistant-document-menu'},[
  h('a',{class:'assistant-back-link',href:'#/assistant',text:'← بازگشت به دستیار'}),
  h('span',{class:'section-kicker',text:'آکادمی وکالت شهرام مختاری'}),
  h('h1',{text:'تنظیم اسناد'}),
  h('p',{class:'muted',text:'نوع سند یا قرارداد را انتخاب کنید تا فرم اختصاصی آن باز شود.'}),
  h('section',{class:'assistant-menu-section'},[h('h2',{text:'تنظیم اسناد قضایی و حقوقی'}),h('div',{class:'assistant-document-grid'},docs)]),
  h('section',{class:'assistant-menu-section'},[h('h2',{text:'تنظیم قرارداد'}),card(['contract','تنظیم انواع قرارداد','file-text','انتخاب نوع قرارداد و تکمیل فرم اختصاصی'])]),
  h('p',{class:'ai-history-link'},[h('a',{href:'#/assistant/history',text:'سوابق گفت‌وگوها ←'})]),
 ]);
}

export function assistantDocumentPage(params={}) {
 const type=params.type||'';
 const contract=type==='contract';
 const schema=SCHEMAS[type];
 if(!contract&&!schema) return h('div',{class:'assistant'},[h('h1',{text:'نوع سند شناخته نشد'}),h('a',{href:'#/assistant',text:'بازگشت به فهرست اسناد'})]);
 const title=contract?'تنظیم قرارداد':schema[0];
 const root=h('div',{class:'assistant assistant-document-page'},[
  h('a',{class:'assistant-back-link',href:'#/assistant',text:'← بازگشت به فهرست اسناد'}),
  h('span',{class:'section-kicker',text:'دستیار هوشمند وکیل'}),h('h1',{text:title}),
  h('p',{class:'muted',text:contract?'نوع قرارداد را انتخاب کنید تا فیلدهای اختصاصی آن نمایش داده شود.':'اطلاعات را در فیلدهای جداگانه وارد کنید؛ نیازی به نوشتن یک شرح طولانی در یک کادر نیست.'})
 ]);
 const workspace=h('div',{class:'assistant-document-workspace'},[h('p',{class:'muted',text:'در حال بررسی دسترسی…'})]);
 const status=h('p',{class:'muted assistant-document-status',role:'status','aria-live':'polite'});
 root.append(status,workspace);
 (async()=>{
  const [me,ai,settings]=await Promise.all([getJson('/api/me'),aiStatus(),getJson('/api/access-settings').catch(()=>({ok:false}))]);
  const guest=!me.ok&&settings.ok&&settings.data?.registrationRequired===false;
  if(!me.ok&&!guest){workspace.replaceChildren(h('div',{class:'notice'},[h('p',{text:'برای استفاده از دستیار ابتدا وارد حساب خود شوید.'}),h('a',{href:'#/account',text:'ورود یا ثبت‌نام'})]));return;}
  if(!ai.configured){workspace.replaceChildren(h('div',{class:'notice',text:'سرویس دستیار در حال حاضر روی سرور فعال نیست.'}));return;}
  const form=h('form',{class:'assistant-structured-form'});
  const fieldsHost=h('div',{class:'assistant-document-fields'});
  let contractSelect=null;
  let conversation=[];
  let followupHost=null;
  let currentQuestions=[];
  function renderFields(){
   fieldsHost.replaceChildren();
   if(contract){
    const selected=CONTRACT_TYPES.find(x=>x[0]===contractSelect.value);
    fieldsHost.append(formSection('اطلاعات اصلی قرارداد','اطلاعات طرفین و توافق را تکمیل کنید.',CONTRACT_BASE));
    const extra=CONTRACT_EXTRA[contractSelect.value]||[];
    if(extra.length) fieldsHost.append(formSection('اطلاعات اختصاصی قرارداد','این فیلدها متناسب با نوع انتخاب‌شده‌اند.',extra));
    if(selected) fieldsHost.prepend(h('p',{class:'assistant-selected-contract',text:'نوع قرارداد: '+selected[1]}));
   } else fieldsHost.append(formSection('اطلاعات سند',schema[1].length+' بخش اطلاعاتی',schema[1]));
  }
  if(contract){
   contractSelect=h('select',{name:'contractType',required:''},[
    h('option',{value:'',text:'نوع قرارداد را انتخاب کنید…'}),
    ...CONTRACT_TYPES.map(x=>h('option',{value:x[0],text:x[1]}))
   ]);
   contractSelect.addEventListener('change',renderFields);
   form.append(h('div',{class:'field assistant-contract-type'},[h('label',{text:'نوع قرارداد'}),contractSelect]));
  }
  form.append(fieldsHost);
  const submit=h('button',{class:'btn assistant-generate-btn',type:'submit',text:'تولید پیش‌نویس حقوقی'});
  form.append(submit,h('p',{class:'muted',text:'اطلاعات نامشخص را خالی بگذارید؛ سامانه باید ابتدا پیش‌نویس را بر پایه اطلاعات موجود تهیه کند و فقط کمبودهای ضروری را بپرسد.'}));
  const result=h('section',{class:'assistant-generated-result',hidden:''});
  const output=h('div',{class:'assistant-generated-text'});
  const notesHost=h('div',{class:'assistant-draft-notes'});
  const copy=h('button',{class:'btn secondary',type:'button',text:'کپی متن پیش‌نویس'});
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(output.textContent);status.textContent='متن پیش‌نویس کپی شد.';}catch{status.textContent='کپی خودکار انجام نشد؛ متن را انتخاب کنید.';}});
  result.append(h('h2',{text:'پیش‌نویس سند'}),output,notesHost,copy);
  workspace.replaceChildren(form,result);
  function renderFollowups(questions){
   currentQuestions=questions;
   if(followupHost) followupHost.remove();
   followupHost=null;
   if(!questions.length)return;
   followupHost=h('section',{class:'assistant-form-section assistant-followup-section'});
   followupHost.append(h('h2',{text:'اطلاعات تکمیلی موردنیاز'}),h('p',{class:'muted',text:'پرسش‌ها فقط درباره مواردی است که برای تکمیل همین پیش‌نویس لازم است. پاسخ هر مورد را در کادر مربوط بنویسید؛ اطلاعات قبلی دوباره درخواست نمی‌شود.'}));
   questions.forEach((question,index)=>{
    const control=h('textarea',{name:'followup_'+index,rows:'3',required:'',placeholder:'پاسخ این پرسش را وارد کنید.'});
    followupHost.append(h('div',{class:'field assistant-form-field'},[h('label',{text:(index+1)+'. '+question}),control]));
   });
   followupHost.append(h('p',{class:'muted',text:'پس از ارسال پاسخ‌ها، پیش‌نویس بر اساس اطلاعات قبلی و پاسخ‌های جدید بازنویسی می‌شود.'}));
   form.insertBefore(followupHost,submit);
  }
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!form.reportValidity())return;
   const data=new FormData(form);
   let message='';
   if(conversation.length===0||currentQuestions.length===0){
    const parts=[];
    if(contract){const selected=CONTRACT_TYPES.find(x=>x[0]===data.get('contractType'));parts.push('نوع قرارداد: '+(selected?.[1]||''));}
    for(const [key,value] of data.entries()){
     if(key==='contractType'||key.startsWith('followup_')||!String(value).trim())continue;
     const control=form.elements.namedItem(key);
     const label=control?.closest('.field')?.querySelector('label')?.textContent||key;
     parts.push(label+': '+String(value).trim());
    }
    message=parts.join('\n\n');
   }else{
    const answers=[];
    currentQuestions.forEach((question,index)=>{
     const answer=String(data.get('followup_'+index)||'').trim();
     if(answer)answers.push('پرسش: '+question+'\nپاسخ: '+answer);
    });
    if(!answers.length){status.textContent='دست‌کم یک پاسخ تکمیلی وارد کنید.';return;}
    message='پاسخ‌های تکمیلی کاربر برای ادامه و اصلاح همان پیش‌نویس:\n\n'+answers.join('\n\n');
   }
   submit.disabled=true;submit.textContent='در حال تهیه و تکمیل پیش‌نویس…';
   status.textContent=conversation.length?'پاسخ‌ها دریافت شد؛ پیش‌نویس قبلی و اطلاعات تازه در حال ترکیب است.':'اطلاعات دریافت شد؛ پیش‌نویس اولیه در حال تهیه است.';
   const res=await postJson('/api/ai/assistant',{mode:'draft',docType:type,message,history:conversation},{timeoutMs:100000});
   submit.disabled=false;submit.textContent='به‌روزرسانی پیش‌نویس';
   if(!res.ok||!res.data?.ok){
    const code=res.data?.error||(res.timeoutError?'AI_REQUEST_TIMEOUT':res.networkError?'NETWORK':'AI_UNAVAILABLE');
    status.textContent=errorText(code)+' (کد: '+code+'). اطلاعات واردشده و پیش‌نویس قبلی حفظ شده‌اند.';return;
   }
   const draft=typeof res.data.text==='string'?res.data.text.trim():'';
   output.textContent=draft||(res.data.status==='need_info'?'پیش‌نویس اولیه با اطلاعات موجود تهیه نشد؛ لطفاً پاسخ پرسش‌های تکمیلی را ثبت کنید.':'پاسخی از سرویس دریافت نشد.');
   notesHost.replaceChildren();
   if(Array.isArray(res.data.notes)&&res.data.notes.length){
    notesHost.append(h('h3',{text:'نکات و موارد قابل بررسی'}),h('ul',{},res.data.notes.map(note=>h('li',{text:note}))));
   }
   result.hidden=false;
   const questions=Array.isArray(res.data.questions)?res.data.questions.filter(q=>typeof q==='string'&&q.trim()).slice(0,5):[];
   const assistantTurn=[draft,questions.length?'پرسش‌های تکمیلی:\n'+questions.map((q,i)=>(i+1)+'. '+q).join('\n'):''].filter(Boolean).join('\n\n');
   conversation.push({role:'user',text:message},{role:'ai',text:assistantTurn});
   renderFollowups(questions);
   status.textContent=questions.length?'پیش‌نویس اولیه آماده است. فقط اطلاعات ضروریِ باقی‌مانده را در فیلدهای بالا وارد کنید تا سند به‌روزرسانی شود.':'پیش‌نویس به‌روزرسانی شد. متن را بررسی و در صورت نیاز اصلاح کنید.';
   result.scrollIntoView({behavior:'smooth',block:'start'});
  });
  renderFields();
 })().catch(()=>workspace.replaceChildren(h('div',{class:'notice',text:'بارگذاری فرم با خطا روبه‌رو شد. صفحه را دوباره بارگذاری کنید.'})));
 return root;
}
