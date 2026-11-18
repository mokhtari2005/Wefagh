import { h } from './dom.js';
import { icon } from './icons.js';
import { getJson, postJson } from './api.js';
import { aiStatus, errorText } from './ai-client.js';
import { DOC_TYPES, CONTRACT_TYPES, ASSISTANT_NOTICE } from './assistant.js';

const DOCS = [
 ['petition','دادخواست','file-text','تنظیم دادخواست حقوقی، خواسته و دلایل'],
 ['defense','لایحه دفاعیه','shield-check','پاسخ مستدل به ادعاهای طرف مقابل'],
 ['appeal','تجدیدنظرخواهی','scale','اعتراض به رأی و بیان جهات تجدیدنظر'],
 ['cassation','فرجام‌خواهی','landmark','درخواست و لایحه فرجامی'],
 ['enforcement','درخواست اجرایی','gavel','درخواست‌های اجرای احکام و عملیات اجرایی'],
 ['notice','اظهارنامه','mail','اعلام رسمی مطالبه، اخطار یا اراده'],
 ['criminal_complaint','شکواییه کیفری','alert-circle','شرح واقعه، طرفین و ادله شکایت'],
 ['reply','پاسخ به سند طرف مقابل','message-square','پاسخ به دادخواست، لایحه یا دفاعیات'],
 ['judicial_request','درخواست قضایی','clipboard-list','درخواست متناسب با موضوع پرونده'],
 ['letter','نامه حقوقی','file-text','مکاتبه رسمی با اشخاص و مراجع'],
 ['other','سایر اسناد','files','تنظیم یا تحلیل سند با قالب اختصاصی']
];

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
  ? h('textarea',{name,rows:'3',required,placeholder:'اطلاعات مربوط به این بخش را وارد کنید.'})
  : h('input',{name,type:'text',required,placeholder:'وارد کنید'});
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
  icon('chevron-left',{size:18})
 ]);
}

export function assistantMenuPage() {
 const docs=DOCS.map(card);
 return h('div',{class:'assistant assistant-document-menu'},[
  h('span',{class:'section-kicker',text:'آکادمی وکالت شهرام مختاری'}),
  h('h1',{text:'دستیار هوشمند وکیل'}),
  h('p',{class:'muted',text:'نوع خدمت یا سند را انتخاب کنید تا فرم اختصاصی آن در صفحه‌ای جداگانه باز شود.'}),
  h('section',{class:'assistant-menu-section'},[
   h('h2',{text:'خدمات حقوقی'}),
   h('a',{class:'assistant-document-card assistant-consult-card',href:'#/assistant/consult'},[
    h('span',{class:'assistant-document-icon'},[icon('scale',{size:22})]),
    h('span',{class:'assistant-document-copy'},[h('strong',{text:'مشاوره حقوقی و تحلیل پرونده'}),h('small',{text:'پرسش حقوقی، تحلیل و بررسی متن'})]),
    icon('chevron-left',{size:18})
   ])
  ]),
  h('section',{class:'assistant-menu-section'},[h('h2',{text:'تنظیم اسناد قضایی و حقوقی'}),h('div',{class:'assistant-document-grid'},docs)]),
  h('section',{class:'assistant-menu-section'},[h('h2',{text:'تنظیم قرارداد'}),card(['contract','تنظیم انواع قرارداد','file-text','انتخاب نوع قرارداد و تکمیل فرم اختصاصی'])]),
  h('p',{class:'ai-history-link'},[h('a',{href:'#/assistant/history',text:'سوابق گفت‌وگوها ←'})]),
  h('details',{class:'ai-notice'},[h('summary',{text:'ملاحظات استفاده از دستیار'}),h('p',{class:'muted',text:ASSISTANT_NOTICE})])
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
  h('p',{class:'muted',text:contract?'نوع قرارداد را انتخاب کنید تا فیلدهای اختصاصی آن نمایش داده شود.': 'اطلاعات را در فیلدهای جداگانه وارد کنید؛ نیازی به نوشتن یک شرح طولانی در یک کادر نیست.'})
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
   contractSelect=h('select',{name:'contractType',required:true},[
    h('option',{value:'',text:'نوع قرارداد را انتخاب کنید…'}),
    ...CONTRACT_TYPES.map(x=>h('option',{value:x[0],text:x[1]}))
   ]);
   contractSelect.addEventListener('change',renderFields);
   form.append(h('div',{class:'field assistant-contract-type'},[h('label',{text:'نوع قرارداد'}),contractSelect]));
  }
  form.append(fieldsHost);
  const submit=h('button',{class:'btn assistant-generate-btn',type:'submit',text:'تولید پیش‌نویس حقوقی'});
  form.append(submit,h('p',{class:'muted',text:'فیلدهای ضروری را تکمیل کنید. اطلاعات نامشخص را خالی بگذارید؛ سامانه نباید واقعیت یا توافقی را حدس بزند.'}));
  const result=h('section',{class:'assistant-generated-result',hidden:''});
  const output=h('div',{class:'assistant-generated-text'});
  const copy=h('button',{class:'btn secondary',type:'button',text:'کپی متن'});
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(output.textContent);status.textContent='متن پیش‌نویس کپی شد.';}catch{status.textContent='کپی خودکار انجام نشد؛ متن را انتخاب کنید.';}});
  result.append(h('h2',{text:'پیش‌نویس تولیدشده'}),output,copy);
  workspace.replaceChildren(form,result);
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!form.reportValidity())return;
   const data=new FormData(form),parts=[];
   if(contract){const selected=CONTRACT_TYPES.find(x=>x[0]===data.get('contractType'));parts.push('نوع قرارداد: '+(selected?.[1]||''));}
   for(const [key,value] of data.entries()){
    if(key==='contractType'||!String(value).trim())continue;
    const control=form.elements.namedItem(key);
    const label=control?.closest('.field')?.querySelector('label')?.textContent||key;
    parts.push(label+': '+String(value).trim());
   }
   const message=parts.join('\\n\\n');
   submit.disabled=true;submit.textContent='در حال تولید پیش‌نویس…';status.textContent='درخواست ارسال شد؛ اطلاعات فرم حفظ می‌شود.';
   result.hidden=true;
   const res=await postJson('/api/ai/assistant',{mode:'draft',docType:type,message,history:[]},{timeoutMs:100000});
   submit.disabled=false;submit.textContent='تولید دوباره پیش‌نویس';
   if(!res.ok||!res.data?.ok){
    const code=res.data?.error||(res.timeoutError?'AI_REQUEST_TIMEOUT':res.networkError?'NETWORK':'AI_UNAVAILABLE');
    status.textContent=errorText(code)+' (کد: '+code+'). اطلاعات فرم حفظ شده است.';return;
   }
   output.textContent=res.data.status==='need_info'
    ? 'برای تکمیل پیش‌نویس، اطلاعات زیر لازم است:\\n'+(res.data.questions||[]).map((q,i)=>(i+1)+'. '+q).join('\\n')
    : res.data.text||'پاسخی از سرویس دریافت نشد.';
   result.hidden=false;
   status.textContent=res.data.status==='need_info'?'اطلاعات تکمیلی لازم است؛ آن‌ها را در فیلدهای مربوط وارد و دوباره ارسال کنید.':'پیش‌نویس آماده شد. پیش از استفاده، متن را با اسناد و قوانین جاری تطبیق دهید.';
   result.scrollIntoView({behavior:'smooth',block:'start'});
  });
  renderFields();
 })().catch(()=>workspace.replaceChildren(h('div',{class:'notice',text:'بارگذاری فرم با خطا روبه‌رو شد. صفحه را دوباره بارگذاری کنید.'})));
 return root;
}
