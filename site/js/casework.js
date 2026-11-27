import { getJson, postJson, sendJson } from './api.js';
import { formatShamsi } from './shamsi.js';

const STATUS = {
  draft:'پیش‌نویس / در انتظار تکمیل', active:'در حال اجرا', waiting_upload:'منتظر بارگذاری فایل',
  waiting_analysis:'در انتظار تحلیل', ready_next:'آماده اقدام بعدی', completed:'تکمیل‌شده', archived:'بایگانی‌شده',
};
const SERVICE_STATUS = {draft:'پیش‌نویس',in_progress:'در حال انجام',waiting_upload:'منتظر فایل',waiting_analysis:'در انتظار تحلیل',ready_next:'آماده اقدام',completed:'تکمیل‌شده',archived:'بایگانی'};
const DOC_TYPE = {attachment:'پیوست',draft:'پیش‌نویس',final:'سند نهایی',evidence:'دلیل و مدرک',contract:'قرارداد',correspondence:'مکاتبه',report:'گزارش',other:'سایر'};
const SERVICE_TYPES = [
  ['petition','تنظیم دادخواست'],['defense','تنظیم لایحه'],['notice','تهیه اظهارنامه'],
  ['analysis','بررسی و تحلیل پرونده'],['contract','بررسی قرارداد'],['expert_report','گزارش کارشناسی'],
  ['other','خدمت دیگر'],
];
const h=(tag,attrs={},children=[])=>{
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k==='class')n.className=v;else if(k==='value')n.value=v;else n.setAttribute(k,v);}
  for(const c of children)if(c)n.append(c);
  return n;
};
const button=(label,cls='btn secondary')=>h('button',{type:'button',class:cls,text:label});
const date=(value)=>value?formatShamsi(new Date(value)):'—';
const statusPill=(value)=>h('span',{class:'casework-status casework-status-'+value,text:STATUS[value]||SERVICE_STATUS[value]||value});
function message(root,text,error=false){const el=h('p',{class:error?'casework-message is-error':'casework-message',role:error?'alert':'status',text});root.prepend(el);setTimeout(()=>el.remove(),5000);}
function panel(title,body,extra=null){return h('section',{class:'casework-panel'},[h('div',{class:'casework-panel-head'},[h('h2',{text:title}),...(extra?[extra]:[])]),body]);}
function metric(title,value,sub=''){return h('article',{class:'casework-metric'},[h('span',{class:'casework-metric-label',text:title}),h('strong',{text:String(value)}),sub?h('small',{text:sub}):null]);}
function empty(text){return h('div',{class:'casework-empty',text});}

export function caseworkPage(){
  const root=h('div',{class:'casework-page'});
  const createButton=button('＋ ثبت پرونده جدید','btn');
  const header=h('header',{class:'casework-header'},[
    h('div',{},[h('p',{class:'casework-eyebrow',text:'مدیریت حرفه‌ای پرونده‌ها'}),h('h1',{text:'پرونده‌های من'}),h('p',{class:'muted',text:'هر پرونده، یک بایگانی مستقل برای خدمات، اسناد و تمام سوابق آن.'})]),
    createButton
  ]);
  const trashButton=button('سطل بازیابی');
  header.append(trashButton);
  trashButton.addEventListener('click',showTrash);
  async function showTrash(){
    const result=await getJson('/api/casework/trash');
    if(!result.ok){message(root,'دریافت سطل بازیابی ناموفق بود.',true);return;}
    const dialog=h('dialog',{class:'casework-help'},[h('h2',{text:'سطل بازیابی پرونده‌ها و اسناد'})]);
    const list=h('div',{class:'casework-trash-list'});
    const items=[
      ...(result.data.cases||[]).map(item=>({kind:'case',id:item.id,title:item.name,subtitle:'پرونده'})),
      ...(result.data.documents||[]).map(item=>({kind:'document',id:item.id,title:item.name,subtitle:'سند ـ '+item.originalName})),
    ];
    if(!items.length)list.append(empty('سطل بازیابی خالی است.'));
    for(const item of items){
      const restore=button('بازیابی','btn secondary');
      restore.addEventListener('click',async()=>{
        const url=item.kind==='case'?'/api/casework/cases/'+item.id+'/restore':'/api/casework/documents/'+item.id+'/restore';
        const response=await sendJson('POST',url,{});
        if(response.ok){dialog.close();load();}else message(root,'بازیابی انجام نشد.',true);
      });
      list.append(h('div',{class:'casework-trash-item'},[h('div',{},[h('strong',{text:item.title}),h('small',{text:item.subtitle})]),restore]));
    }
    dialog.append(list,button('بستن'));
    dialog.querySelector('button:last-child').addEventListener('click',()=>dialog.close());
    root.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }
  const form=h('form',{class:'casework-create',hidden:true});
  const name=h('input',{name:'name',required:true,minlength:'2',maxlength:'180',placeholder:'نام پرونده؛ مثلاً مطالبه وجه قرارداد'});
  const number=h('input',{name:'caseNumber',maxlength:'120',placeholder:'شماره پرونده یا کلاسه (اختیاری)'});
  const subject=h('input',{name:'subject',maxlength:'500',placeholder:'موضوع پرونده (اختیاری)'});
  const plaintiff=h('input',{name:'partyOne',maxlength:'180',placeholder:'نام شخص / موکل (اختیاری)'});
  const description=h('textarea',{name:'description',rows:'2',maxlength:'8000',placeholder:'یادداشت اولیه پرونده'});
  const submit=h('button',{type:'submit',class:'btn',text:'ایجاد پرونده و ورود به بایگانی'});
  const cancel=button('انصراف');
  let autosavedCaseId='';
  let autosaveTimer=null;
  let autosavePromise=Promise.resolve();
  const draftPayload=()=>({name:name.value,caseNumber:number.value,subject:subject.value,description:description.value,parties:plaintiff.value.trim()?[{name:plaintiff.value.trim(),role:'طرف اصلی'}]:[],status:'draft'});
  async function saveDraftToServer(){
    if(name.value.trim().length<2)return;
    const payload=draftPayload();
    const result=autosavedCaseId
      ? await sendJson('PATCH','/api/casework/cases/'+autosavedCaseId,payload)
      : await postJson('/api/casework/cases',payload);
    if(!result.ok)throw new Error(result.data?.error||'ذخیره خودکار پرونده انجام نشد.');
    if(!autosavedCaseId)autosavedCaseId=result.data.case.id;
    notice.textContent='پیش‌نویس پرونده به‌صورت خودکار ذخیره شد.';
  }
  function scheduleCaseAutosave(){
    clearTimeout(autosaveTimer);
    autosaveTimer=setTimeout(()=>{autosavePromise=autosavePromise.then(saveDraftToServer).catch(error=>{notice.textContent=error.message;});},650);
  }
  [name,number,subject,plaintiff,description].forEach(input=>input.addEventListener('input',scheduleCaseAutosave));
  form.append(h('h2',{text:'ثبت پرونده جدید'}),h('div',{class:'casework-form-grid'},[
    h('label',{},[h('span',{text:'نام پرونده *'}),name]),
    h('label',{},[h('span',{text:'شماره پرونده / کلاسه'}),number]),
    h('label',{},[h('span',{text:'موضوع'}),subject]),
    h('label',{},[h('span',{text:'نام موکل یا طرف اصلی'}),plaintiff]),
    h('label',{class:'casework-full'},[h('span',{text:'یادداشت اولیه'}),description]),
  ]),h('div',{class:'casework-actions'},[submit,cancel]));
  const stats=h('div',{class:'casework-metrics'});
  const continuation=h('section',{class:'casework-panel'},[h('div',{class:'casework-panel-head'},[h('h2',{text:'ادامه کار'}),h('span',{class:'muted',text:'پرونده‌های نیمه‌تمام'})]),h('div',{class:'casework-cards',id:'casework-continuation'})]);
  const search=h('input',{type:'search',placeholder:'جست‌وجو در نام، شماره، موضوع یا طرفین',maxlength:'120','aria-label':'جست‌وجوی پرونده'});
  const sort=h('select',{'aria-label':'مرتب‌سازی'},[
    h('option',{value:'activity',text:'آخرین فعالیت'}),h('option',{value:'newest',text:'جدیدترین'}),h('option',{value:'oldest',text:'قدیمی‌ترین'}),
    h('option',{value:'name',text:'نام پرونده'}),h('option',{value:'number',text:'شماره پرونده'}),h('option',{value:'services',text:'تعداد خدمات'}),
  ]);
  const filter=h('select',{'aria-label':'وضعیت پرونده'},[h('option',{value:'',text:'همه وضعیت‌ها'}),...Object.entries(STATUS).map(([v,t])=>h('option',{value:v,text:t}))]);
  const list=h('div',{class:'casework-cards'});
  const listPanel=panel('همه پرونده‌ها',list,h('div',{class:'casework-filters'},[search,sort,filter]));
  const help=button('راهنمای این بخش','btn text');
  help.addEventListener('click',()=>showHelp(root,'مدیریت پرونده‌ها','پرونده را حتی بدون فایل ثبت کنید. شناسه پرونده بلافاصله ساخته می‌شود. سپس خدمات متعدد و اسناد هر خدمت را از داخل همان پرونده اضافه کنید. عملیات نیمه‌تمام در «ادامه کار» می‌ماند و اطلاعات آن با خروج از صفحه حذف نمی‌شود.'));
  createButton.addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden)name.focus();});
  cancel.addEventListener('click',()=>{clearTimeout(autosaveTimer);form.reset();form.hidden=true;if(autosavedCaseId){message(root,'پیش‌نویس ذخیره‌شده در بخش «ادامه کار» باقی می‌ماند.');load();}autosavedCaseId='';});
  form.addEventListener('submit',async e=>{
    e.preventDefault();submit.disabled=true;submit.textContent='در حال ذخیره…';
    try{
      clearTimeout(autosaveTimer);
      await autosavePromise;
      if(!autosavedCaseId)await saveDraftToServer();
      else {
        const updated=await sendJson('PATCH','/api/casework/cases/'+autosavedCaseId,draftPayload());
        if(!updated.ok)throw new Error(updated.data?.error||'ثبت پرونده ناموفق بود');
      }
      if(!autosavedCaseId)throw new Error('شناسه پرونده ایجاد نشد.');
      location.hash='#/casework/'+autosavedCaseId;
    }catch(err){message(form,err.message,true);}
    finally{submit.disabled=false;submit.textContent='ایجاد پرونده و ورود به بایگانی';}
  });
  const calculatorHistory=h('div',{class:'casework-documents'});
  const calculatorPanel=panel('سوابق اقدامات با محاسبه‌گرها',calculatorHistory);
  root.append(header,form,stats,continuation,h('div',{class:'casework-list-toolbar'},[h('h2',{text:'فهرست پرونده‌ها'}),help]),listPanel,calculatorPanel);
  let timer;
  async function load(){
    list.replaceChildren(h('p',{class:'muted',text:'در حال دریافت پرونده‌ها…'}));
    const params=new URLSearchParams({sort:sort.value});
    if(search.value.trim())params.set('q',search.value.trim());
    if(filter.value)params.set('status',filter.value);
    const res=await getJson('/api/casework/cases?'+params.toString());
    if(!res.ok){list.replaceChildren(empty(res.status===401?'برای مشاهده پرونده‌ها وارد حساب خود شوید.':'دریافت پرونده‌ها انجام نشد.'));stats.replaceChildren();continuation.lastElementChild.replaceChildren();return;}
    const actionResult=await getJson('/api/casework/actions?limit=12');
    const recentActions=actionResult.ok?actionResult.data.actions||[]:[];
    calculatorHistory.replaceChildren(...(recentActions.length?recentActions.map(action=>{
      const item=h('article',{class:'casework-service-card'},[
        h('div',{},[h('strong',{text:action.title}),h('small',{text:date(action.createdAt)+' · '+(action.caseName||'محاسبه عمومی')}),
          action.resultData?.text?h('p',{class:'muted',text:String(action.resultData.text).slice(0,220)}):null]),
        action.caseId?h('a',{class:'btn secondary',href:'#/casework/'+action.caseId,text:'پرونده'}):null
      ]);
      return item;
    }):[empty('هنوز محاسبه‌ای در سوابق شما ثبت نشده است.')]));
    const items=res.data.cases||[];
    const allRes=filter.value?await getJson('/api/casework/cases?sort=activity'):res;
    const all=allRes.ok?allRes.data.cases||[]:items;
    const counts=Object.fromEntries(Object.keys(STATUS).map(k=>[k,all.filter(x=>x.status===k).length]));
    stats.replaceChildren(metric('همه پرونده‌ها',all.length),metric('در حال اجرا',counts.active||0),metric('منتظر تکمیل',all.filter(x=>['draft','waiting_upload','waiting_analysis'].includes(x.status)).length),metric('آماده اقدام',counts.ready_next||0),metric('تکمیل‌شده',counts.completed||0),metric('بایگانی',counts.archived||0));
    const pending=all.filter(x=>['draft','waiting_upload','waiting_analysis'].includes(x.status));
    continuation.lastElementChild.replaceChildren(...(pending.length?pending.slice(0,6).map(caseCard):[empty('در حال حاضر عملیات نیمه‌تمامی وجود ندارد.')]));
    const pendingStatuses=['draft','waiting_upload','waiting_analysis'];
    const visibleItems=filter.value?items:items.filter(item=>!pendingStatuses.includes(item.status));
    list.replaceChildren(...(visibleItems.length?visibleItems.map(caseCard):[empty(filter.value?'پرونده‌ای با این وضعیت پیدا نشد.':'پرونده‌های نیمه‌تمام در بخش «ادامه کار» نمایش داده می‌شوند. برای دیدن همه وضعیت‌ها از فیلتر استفاده کنید.')]));
  }
  function caseCard(item){
    const link=h('a',{class:'casework-card',href:'#/casework/'+item.id},[
      h('div',{class:'casework-card-top'},[h('strong',{text:item.name}),statusPill(item.status)]),
      h('p',{class:'muted',text:[item.caseNumber?'کلاسه '+item.caseNumber:'',item.subject].filter(Boolean).join(' · ')||'موضوع ثبت نشده'}),
      h('div',{class:'casework-card-meta'},[h('span',{text:(item.serviceCount||0)+' خدمت'}),h('span',{text:(item.documentCount||0)+' سند'}),h('span',{text:'آخرین فعالیت: '+date(item.lastActivityAt)})])
    ]);
    return link;
  }
  search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,250);});
  sort.addEventListener('change',load);filter.addEventListener('change',load);
  load();
  return root;
}
function showHelp(root,title,body){
  const dialog=h('dialog',{class:'casework-help'},[h('h2',{text:title}),h('p',{text:body}),button('بستن')]);
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  root.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}

export function caseworkDetailPage(caseId){
  const root=h('div',{class:'casework-page casework-detail'});
  const back=h('a',{class:'casework-back',href:'#/casework',text:'← بازگشت به پرونده‌ها'});
  const heading=h('div',{class:'casework-detail-heading'},[h('p',{class:'muted',text:'پرونده و بایگانی جامع'}),h('h1',{text:'در حال دریافت پرونده…'})]);
  const actions=h('div',{class:'casework-actions'});
  const metrics=h('div',{class:'casework-metrics'});
  const meta=h('section',{class:'casework-panel'});
  const serviceList=h('div',{class:'casework-cards'});
  const docList=h('div',{class:'casework-documents'});
  const timeline=h('ol',{class:'casework-timeline'});
  const calculatorActions=h('div',{class:'casework-documents'});
  const notice=h('p',{class:'casework-message',role:'status'});
  const serviceForm=h('form',{class:'casework-create',hidden:true});
  const serviceType=h('select',{name:'type'},SERVICE_TYPES.map(([v,t])=>h('option',{value:v,text:t})));
  const serviceTitle=h('input',{name:'title',required:true,minlength:'2',maxlength:'180',placeholder:'عنوان خدمت'});
  serviceForm.append(h('h3',{text:'افزودن خدمت به همین پرونده'}),h('label',{},[h('span',{text:'نوع خدمت'}),serviceType]),h('label',{},[h('span',{text:'عنوان خدمت'}),serviceTitle]),h('div',{class:'casework-actions'},[h('button',{type:'submit',class:'btn',text:'ثبت خدمت'}),button('انصراف')]));
  const uploadForm=h('form',{class:'casework-create',hidden:true});
  const file=h('input',{type:'file',required:true,accept:'.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.txt,.rtf'});
  const docType=h('select',{},Object.entries(DOC_TYPE).map(([v,t])=>h('option',{value:v,text:t})));
  const serviceSelect=h('select',{},[h('option',{value:'',text:'بدون خدمت مشخص'})]);
  const description=h('input',{maxlength:'2000',placeholder:'توضیح کوتاه درباره سند (اختیاری)'});
  const uploadBtn=h('button',{type:'submit',class:'btn',text:'بارگذاری و ثبت در بایگانی'});
  uploadForm.append(h('h3',{text:'افزودن سند به بایگانی پرونده'}),h('label',{},[h('span',{text:'فایل'}),file]),h('label',{},[h('span',{text:'نوع سند'}),docType]),h('label',{},[h('span',{text:'خدمت مرتبط'}),serviceSelect]),h('label',{},[h('span',{text:'توضیحات'}),description]),h('div',{class:'casework-actions'},[uploadBtn,button('انصراف')]));
  serviceForm.querySelectorAll('button')[1].addEventListener('click',()=>serviceForm.hidden=true);
  uploadForm.querySelectorAll('button')[1].addEventListener('click',()=>uploadForm.hidden=true);
  const servicePanel=panel('خدمات این پرونده',serviceList,button('＋ خدمت جدید'));
  servicePanel.querySelector('.casework-panel-head button').addEventListener('click',()=>{serviceForm.hidden=!serviceForm.hidden;serviceTitle.focus();});
  const docTools=h('div',{class:'casework-doc-tools'});
  const docSearch=h('input',{type:'search',placeholder:'جست‌وجو در نام و توضیحات اسناد','aria-label':'جست‌وجوی اسناد'});
  const docFilter=h('select',{},[h('option',{value:'',text:'همه اسناد'}),h('option',{value:'upload',text:'فایل‌های ورودی'}),h('option',{value:'generated',text:'اسناد تولیدشده'}),h('option',{value:'final',text:'اسناد نهایی'}),h('option',{value:'draft',text:'پیش‌نویس‌ها'}),h('option',{value:'pdf',text:'PDF'}),h('option',{value:'docx',text:'Word'})]);
  docTools.append(docSearch,docFilter);
  const docPanel=panel('بایگانی یکپارچه اسناد',h('div',{class:'casework-doc-wrap'},[docTools,docList]),button('＋ بارگذاری سند'));
  docPanel.querySelector('.casework-panel-head button').addEventListener('click',()=>{uploadForm.hidden=!uploadForm.hidden;file.focus();});
  serviceForm.addEventListener('submit',async e=>{
    e.preventDefault();const r=await postJson('/api/casework/cases/'+caseId+'/services',{type:serviceType.value,title:serviceTitle.value});
    if(!r.ok){message(root,'ثبت خدمت انجام نشد.',true);return;}serviceForm.reset();serviceForm.hidden=true;await load();
  });
  uploadForm.addEventListener('submit',async e=>{
    e.preventDefault();const chosen=file.files?.[0];if(!chosen)return;
    uploadBtn.disabled=true;uploadBtn.textContent='در حال بارگذاری…';
    try{
      const response=await fetch('/api/casework/cases/'+caseId+'/documents',{method:'POST',credentials:'same-origin',headers:{'Content-Type':chosen.type||'application/octet-stream','X-File-Name':encodeURIComponent(chosen.name),'X-Service-Id':serviceSelect.value,'X-Document-Type':docType.value,'X-Description':description.value},body:chosen});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error==='FILE_STORAGE_NOT_CONFIGURED'?'فضای ذخیره‌سازی اسناد هنوز پیکربندی نشده است.':data?.error||'بارگذاری فایل ناموفق بود.');
      uploadForm.reset();uploadForm.hidden=true;await load();
    }catch(err){message(root,err.message,true);}
    finally{uploadBtn.disabled=false;uploadBtn.textContent='بارگذاری و ثبت در بایگانی';}
  });
  const calculatorPanel=panel('اقدامات ثبت‌شده با محاسبه‌گرها',calculatorActions);
  root.append(back,heading,actions,notice,metrics,meta,serviceForm,servicePanel,docPanel,uploadForm,calculatorPanel,panel('تاریخچه و گردش کار پرونده',timeline));
  let current=null,docs=[];
  function updateServiceSelect(services){
    serviceSelect.replaceChildren(h('option',{value:'',text:'بدون خدمت مشخص'}),...services.map(s=>h('option',{value:s.id,text:s.title})));
  }
  function documentCard(d){
    const card=h('article',{class:'casework-document'},[
      h('div',{class:'casework-document-icon',text:d.mimeType==='application/pdf'?'PDF':d.mimeType.includes('word')?'DOC':'FILE'}),
      h('div',{class:'casework-document-main'},[
        h('strong',{text:d.name}),h('small',{text:(DOC_TYPE[d.type]||d.type)+' · '+(d.serviceTitle||serviceName(d.serviceId))+' · نسخه '+d.version+' · '+date(d.createdAt)}),
        d.description?h('p',{class:'muted',text:d.description}):null,
        h('span',{class:'casework-doc-status',text:d.status==='final'?'نهایی':d.status==='draft'?'پیش‌نویس':d.status==='archived'?'بایگانی':'فعال'})
      ]),
      h('div',{class:'casework-document-actions'},[
        button('مشاهده'),button('دانلود'),button('اشتراک'),button('چاپ'),button('نسخه‌ها'),button('تغییر نام'),button('حذف','btn text danger')
      ])
    ]);
    const [preview,download,share,print,versions,rename,remove]=card.querySelectorAll('button');
    preview.addEventListener('click',()=>openDocument(d,'preview'));
    download.addEventListener('click',()=>openDocument(d,'download'));
    share.addEventListener('click',()=>openDocument(d,'share'));
    print.addEventListener('click',()=>openDocument(d,'print'));
    versions.addEventListener('click',()=>showVersions(d));
    rename.addEventListener('click',async()=>{const value=prompt('نام جدید سند',d.name);if(value?.trim()){const r=await sendJson('PATCH','/api/casework/documents/'+d.id,{name:value.trim()});if(r.ok)load();else message(root,'تغییر نام سند انجام نشد.',true);}});
    remove.addEventListener('click',async()=>{if(!confirm('سند به سطل بازیابی منتقل شود؟ نسخه‌های قبلی و فایل اصلی حذف فیزیکی نمی‌شوند.'))return;const r=await sendJson('PATCH','/api/casework/documents/'+d.id,{status:'deleted'});if(r.ok)load();else message(root,'انتقال سند انجام نشد.',true);});
    return card;
  }
  function serviceName(serviceId){return current?.services.find(s=>s.id===serviceId)?.title||'عمومی پرونده';}
  function renderDocs(){
    const q=docSearch.value.trim().toLocaleLowerCase('fa'),f=docFilter.value;
    const visible=docs.filter(d=>{
      if(q&&!((d.name+' '+d.description).toLocaleLowerCase('fa').includes(q)))return false;
      if(f==='upload'&&d.source!=='upload')return false;if(f==='generated'&&d.source!=='generated')return false;
      if(f==='final'&&d.status!=='final')return false;if(f==='draft'&&d.status!=='draft')return false;
      if(f==='pdf'&&!d.name.toLowerCase().endsWith('.pdf'))return false;if(f==='docx'&&!d.name.toLowerCase().endsWith('.docx'))return false;
      return true;
    });
    docList.replaceChildren(...(visible.length?visible.map(documentCard):[empty('سندی با این فیلتر پیدا نشد.')]));
  }
  async function openDocument(d,action){
    const popup=(action==='preview'||action==='print')?window.open('about:blank','_blank'):null;
    const url='/api/casework/documents/'+d.id+'/content'+(action==='preview'||action==='print'?'?inline=1':'');
    try{
      const response=await fetch(url,{credentials:'same-origin'});if(!response.ok)throw new Error('دریافت سند ناموفق بود.');
      const blob=await response.blob(),fileObj=new File([blob],d.name,{type:d.mimeType});
      if(action==='share'&&navigator.share&&(!navigator.canShare||navigator.canShare({files:[fileObj]}))){await navigator.share({files:[fileObj],title:d.name});return;}
      const objectUrl=URL.createObjectURL(blob);
      if(action==='preview'){if(popup)popup.location.href=objectUrl;else{const a=document.createElement('a');a.href=objectUrl;a.target='_blank';a.rel='noopener';a.click();}setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);return;}
      if(action==='print'){if(popup){popup.location.href=objectUrl;popup.addEventListener('load',()=>popup.print(),{once:true});}else{const a=document.createElement('a');a.href=objectUrl;a.target='_blank';a.click();}setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);return;}
      const a=document.createElement('a');a.href=objectUrl;a.download=d.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
    }catch(err){popup?.close();message(root,err.message||'عملیات فایل انجام نشد.',true);}
  }
  async function showVersions(d){
    const r=await getJson('/api/casework/documents/'+d.id+'/versions');if(!r.ok){message(root,'دریافت نسخه‌ها ناموفق بود.',true);return;}
    const dialog=h('dialog',{class:'casework-help'},[h('h2',{text:'نسخه‌های سند'}),...r.data.versions.map(v=>h('p',{text:'نسخه '+v.version+' ـ '+v.name+' ـ '+date(v.createdAt)})),button('بستن')]);
    dialog.querySelector('button').addEventListener('click',()=>dialog.close());root.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }
  docSearch.addEventListener('input',renderDocs);docFilter.addEventListener('change',renderDocs);
  async function load(){
    const r=await getJson('/api/casework/cases/'+caseId);
    if(!r.ok){heading.replaceChildren(h('h1',{text:r.status===401?'برای مشاهده پرونده وارد شوید.':'پرونده پیدا نشد یا به آن دسترسی ندارید.'}));return;}
    current=r.data;const c=current.case;docs=current.documents||[];
    heading.replaceChildren(h('p',{class:'muted',text:'پرونده و بایگانی جامع'}),h('h1',{text:c.name}),statusPill(c.status));
    actions.replaceChildren(
      button('ویرایش اطلاعات'),button(c.status==='archived'?'فعال‌سازی پرونده':'بایگانی پرونده'),
      button('ادامه خدمت','btn'),
      h('a',{class:'btn',href:'#/assistant/consult?caseId='+encodeURIComponent(caseId),text:'دستیار وکیل برای این پرونده'}),
      h('a',{class:'btn secondary',href:'#/calculators/court?caseId='+encodeURIComponent(caseId),text:'محاسبه‌گر حقوقی'})
    );
    const [edit,archive,continueBtn]=actions.querySelectorAll('button');
    edit.addEventListener('click',()=>editCase(c));
    archive.addEventListener('click',async()=>{const status=c.status==='archived'?'active':'archived';const u=await sendJson('PATCH','/api/casework/cases/'+caseId,{status});if(u.ok)load();});
    continueBtn.addEventListener('click',()=>{serviceForm.hidden=false;serviceTitle.focus();});
    metrics.replaceChildren(metric('خدمات',c.serviceCount),metric('اسناد بایگانی',c.documentCount),metric('فایل‌های ورودی',c.uploadCount),metric('اسناد تولیدشده',c.generatedCount),metric('آخرین فعالیت',date(c.lastActivityAt)));
    meta.replaceChildren(h('div',{class:'casework-meta-grid'},[
      metaItem('شماره پرونده',c.caseNumber||'ثبت نشده'),metaItem('موضوع',c.subject||'ثبت نشده'),
      metaItem('طرفین',c.parties.map(p=>p.name+(p.role?' ('+p.role+')':'')).join('، ')||'ثبت نشده'),
      metaItem('تاریخ تشکیل',date(c.createdAt)),metaItem('توضیحات',c.description||'—'),
    ]));
    serviceList.replaceChildren(...(current.services.length?current.services.map(s=>h('article',{class:'casework-service-card'},[
      h('div',{},[h('strong',{text:s.title}),h('small',{text:SERVICE_TYPES.find(x=>x[0]===s.type)?.[1]||({assistant_consult:'مشاوره دستیار وکیل',assistant_analyze:'تحلیل پرونده با دستیار',assistant_litigation:'بازبینی حقوقی دستیار',assistant_research:'تحقیق حقوقی با دستیار',assistant_review:'بررسی متن با دستیار',assistant_draft:'تنظیم سند با دستیار'}[s.type]||s.type)}),h('p',{class:'muted',text:'ایجاد: '+date(s.createdAt)}),
        s.threadId?h('a',{class:'btn secondary',href:'#/assistant/consult?thread='+encodeURIComponent(s.threadId),text:'بازکردن گفت‌وگو'}):null]),
      statusPill(s.status),
      h('select',{value:s.status},Object.entries(SERVICE_STATUS).map(([v,t])=>h('option',{value:v,text:t})))
    ])):[empty('هنوز خدمتی برای این پرونده ثبت نشده است.')]));
    serviceList.querySelectorAll('select').forEach((sel,i)=>sel.addEventListener('change',async()=>{await sendJson('PATCH','/api/casework/services/'+current.services[i].id,{status:sel.value});await load();}));
    updateServiceSelect(current.services);
    docs.forEach(d=>{d.serviceTitle=serviceName(d.serviceId);});
    renderDocs();
    const calculations=current.calculatorActions||[];
    calculatorActions.replaceChildren(...(calculations.length?calculations.map(action=>h('article',{class:'casework-service-card'},[
      h('div',{},[h('strong',{text:action.title}),h('small',{text:date(action.createdAt)+' · '+action.calculatorKey}),
        action.resultData?.text?h('p',{class:'muted',text:String(action.resultData.text).slice(0,350)}):null]),
      h('a',{class:'btn secondary',href:'#/calculators/'+encodeURIComponent(action.calculatorKey)+'?caseId='+encodeURIComponent(caseId),text:'محاسبه مجدد'})
    ])):[empty('برای این پرونده هنوز محاسبه‌ای ثبت نشده است.')]));
    timeline.replaceChildren(...(current.timeline.length?current.timeline.map(item=>h('li',{},[h('strong',{text:item.title}),h('small',{text:date(item.created_at)}),item.details?.name?h('p',{text:item.details.name}):null])):[empty('هنوز رویدادی ثبت نشده است.')]));
  }
  function metaItem(title,value){return h('div',{class:'casework-meta-item'},[h('small',{text:title}),h('p',{text:value})]);}
  function editCase(c){
    const dialog=h('dialog',{class:'casework-help casework-edit'},[h('h2',{text:'ویرایش اطلاعات پرونده'})]);
    const fields={name:h('input',{value:c.name}),caseNumber:h('input',{value:c.caseNumber}),subject:h('input',{value:c.subject}),description:h('textarea',{rows:'3',text:c.description})};
    for(const [key,label] of [['name','نام پرونده'],['caseNumber','شماره پرونده'],['subject','موضوع'],['description','توضیحات']])dialog.append(h('label',{},[h('span',{text:label}),fields[key]]));
    const save=button('ذخیره','btn'),close=button('انصراف');dialog.append(save,close);close.addEventListener('click',()=>dialog.close());
    save.addEventListener('click',async()=>{const r=await sendJson('PATCH','/api/casework/cases/'+caseId,Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));if(r.ok){dialog.close();load();}else message(root,'ذخیره تغییرات ناموفق بود.',true);});
    root.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  }
  load();
  return root;
}
