import { SHIRAZ_BLOCKS } from './calc/shiraz-1405-data.js';
import { getJson } from './api.js';

function h(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
}
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const parse = (v) => {
  const s = String(v ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '');
  return s === '' ? NaN : Number(s);
};
const money = n => `${fa(Math.round(n))} ریال`;
const LAND_COEFFICIENT = { service: .7, industrial: .6, agriculture: .4, dry: .3, other: .4 };
const BUILDING_RATE = {
  commercial: { concrete: 20400000, other: 5600000 },
  residential: { concrete: 9300000, other: 3300000 },
  service: { concrete: 7140000, other: 2720000 },
  agriculture: { concrete: 3750000, other: 1250000 },
};
const LAND_LABEL = {
  residential: 'مسکونی', commercial: 'تجاری', administrative: 'اداری',
  service: 'خدماتی، آموزشی، فرهنگی، بهداشتی، تفریحی، ورزشی، گردشگری و هتلداری',
  industrial: 'صنعتی، کارگاهی، حمل‌ونقل، انبار و توقفگاه',
  agriculture: 'کشاورزی آبی، باغات و دامداری', dry: 'کشاورزی دیم', other: 'سایر',
};
function input(id, label, value = '', type = 'text') {
  const el = h('input', { id, type, inputmode: type === 'number' ? 'decimal' : 'numeric', value: String(value), autocomplete: 'off' });
  return { el, node: h('div', { class: 'field' }, [h('label', { for: id, text: label }), el]) };
}
function select(id, label, options) {
  const el = h('select', { id }, options.map(([v, t]) => h('option', { value: v, text: t })));
  return { el, node: h('div', { class: 'field' }, [h('label', { for: id, text: label }), el]) };
}
function numeric(el) {
  el.addEventListener('input', () => {
    const raw = el.value.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^0-9]/g, '');
    el.value = raw ? Number(raw).toLocaleString('fa-IR') : '';
  });
}
export function regionalValueTool() {
  const root = h('section', { class: 'tool regional-value-tool', id: 'calc-regional-value' });
  root.append(
    h('h2', { text: 'محاسبه ارزش معاملاتی املاک شهر شیراز' }),
    h('p', { class: 'muted', text: 'بر اساس دفترچه ارزش معاملاتی سال ۱۴۰۵ اداره کل امور مالیاتی فارس؛ شامل ارزش عرصه و اعیانی.' })
  );
  const zone = select('rv-zone', 'منطقه شهرداری / مالیاتی شیراز', Array.from({length:11},(_,i)=>[String(i+1),`منطقه ${fa(i+1)}`]));
  const block = select('rv-block', 'بلوک', []);
  const blockRate = h('p', { class: 'muted', role: 'status' });
  function updateBlocks() {
    const rows = SHIRAZ_BLOCKS.filter(x=>x[0]===Number(zone.el.value));
    block.el.replaceChildren(...rows.map(x=>h('option',{value:x[1],text:`بلوک ${x[1]}`})));
    showRate();
  }
  function showRate() {
    const row = SHIRAZ_BLOCKS.find(x=>x[0]===Number(zone.el.value)&&x[1]===block.el.value);
    blockRate.textContent = row ? `ارزش پایه هر مترمربع — مسکونی: ${money(row[2])} | تجاری: ${money(row[3])} | اداری: ${money(row[4])}` : '';
  }
  zone.el.addEventListener('change',updateBlocks); block.el.addEventListener('change',showRate); updateBlocks();

  const landUse = select('rv-land-use','کاربری عرصه',Object.entries(LAND_LABEL).map(([k,v])=>[k,v]));
  const landArea = input('rv-land-area','مساحت عرصه (مترمربع)');
  const width = input('rv-width','عرض معبر مورد استفاده (متر)', '12');
  const access = select('rv-access','وضعیت دسترسی ملک',[
    ['normal','دسترسی مستقیم از معبر انتخاب‌شده'],
    ['multi','دو بر یا بیشتر؛ معبر با ارزش بالاتر انتخاب شده'],
    ['landlocked','فاقد راه عبور مستقل؛ دارای حق عبور از ملک مجاور (۶۰٪)'],
    ['highway','مجاور بزرگراه، اتوبان، مسیل، راه‌آهن یا نهر؛ دسترسی از معبر دیگر'],
  ]);
  const landFields=[landUse.node,landArea.node,width.node,access.node];

  const buildingToggle=select('rv-building','وضعیت اعیانی',[
    ['yes','ملک دارای ساختمان است'],['no','فاقد اعیانی / عرصه خالی']
  ]);
  const buildingUse=select('rv-building-use','کاربری ساختمان',[
    ['commercial','تجاری'],['residential','مسکونی و اداری'],['service','سایر کاربری‌های خدماتی، صنعتی و عمومی'],['agriculture','کشاورزی']
  ]);
  const structure=select('rv-structure','نوع سازه',[
    ['concrete','اسکلت بتنی و فلزی یا سوله'],['other','سایر سازه‌ها']
  ]);
  const buildingArea=input('rv-building-area','مساحت زیربنای مفید (مترمربع)');
  const stories=input('rv-stories','تعداد طبقات ساختمان (بدون زیرزمین و پیلوت)','1');
  const floor=select('rv-floor','موقعیت طبقه مورد محاسبه (برای تجاری)',[
    ['0','همکف'],['1','یک طبقه بالاتر'],['2','دو طبقه بالاتر'],['3','سه طبقه یا بیشتر بالاتر'],['-1','یک طبقه پایین‌تر'],['-2','دو طبقه پایین‌تر'],['-3','سه طبقه یا بیشتر پایین‌تر']
  ]);
  const age=input('rv-age','قدمت ساختمان (سال)','0');
  const parking=input('rv-parking','مساحت پارکینگ و انباری متعلق به واحد (مترمربع)','0');
  const stage=select('rv-stage','وضعیت تکمیل ساختمان',[
    ['complete','ساختمان تکمیل‌شده (۱۰۰٪)'],['foundation','فونداسیون (۱۰٪)'],['frame','اسکلت (۳۰٪)'],['rough','سفت‌کاری (۵۰٪)'],['finish','نازک‌کاری (۸۰٪)']
  ]);
  const buildFields=[buildingToggle.node,buildingUse.node,structure.node,buildingArea.node,stories.node,floor.node,age.node,parking.node,stage.node];
  const buildingWrap=h('div',{class:'regional-building-fields'},buildFields);
  function syncBuilding(){buildingWrap.hidden=buildingToggle.el.value==='no';}
  buildingToggle.el.addEventListener('change',syncBuilding); syncBuilding();
  for(const f of [landArea.el,width.el,buildingArea.el,stories.el,age.el,parking.el]) numeric(f);

  const out=h('div',{class:'tool-out'});
  const form=h('form',{class:'form regional-value-form',novalidate:'', 'aria-label':'محاسبه ارزش معاملاتی ملک در شیراز'},[
    h('h3',{text:'۱. مشخصات عرصه'}),zone.node,block.node,blockRate,...landFields,
    h('h3',{text:'۲. مشخصات اعیانی'}),buildingWrap,
    h('button',{class:'btn dix-submit',type:'submit',text:'محاسبه ارزش معاملاتی'}),
    out
  ]);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const row=SHIRAZ_BLOCKS.find(x=>x[0]===Number(zone.el.value)&&x[1]===block.el.value);
    const area=parse(landArea.el.value), road=parse(width.el.value);
    if(!row||!Number.isFinite(area)||area<=0||!Number.isFinite(road)||road<=0){
      out.replaceChildren(h('div',{class:'notice',role:'alert',text:'منطقه، بلوک، مساحت عرصه و عرض معبر را به‌درستی وارد کنید.'}));return;
    }
    const use=landUse.el.value;
    const base=use==='residential'?row[2]:use==='commercial'?row[3]:use==='administrative'?row[4]:row[2]*(LAND_COEFFICIENT[use]??.4);
    const commercial=use==='commercial';
    const cap=use==='residential'?20:30;
    const appliedWidth=Math.min(road,cap);
    const widthFactor=1+(appliedWidth-12)*(commercial?.03:.02);
    let accessFactor=access.el.value==='landlocked'?.6:1;
    const landRate=base*widthFactor*accessFactor;
    const landTotal=landRate*area;
    let buildingTotal=0, buildingRate=0, ageFactor=1, floorFactor=1, stageFactor=1, parkingTotal=0;
    const facts=[
      ['منطقه و بلوک',`منطقه ${fa(row[0])}، بلوک ${row[1]}`],
      ['ارزش پایه عرصه در هر مترمربع',money(base)],
      ['عرض معبر مبنای اعمال ضریب',`${fa(road)} متر (اعمال تا سقف ${fa(cap)} متر)`],
      ['ضریب عرض معبر',`${fa(widthFactor*100)}٪`],
      ['ضریب دسترسی',`${fa(accessFactor*100)}٪`],
      ['ارزش تعدیل‌شده هر مترمربع عرصه',money(landRate)],
      ['ارزش کل عرصه',money(landTotal)]
    ];
    if(buildingToggle.el.value==='yes'){
      const bu=buildingUse.el.value, structureKey=structure.el.value;
      const bArea=parse(buildingArea.el.value), count=parse(stories.el.value), years=parse(age.el.value), pArea=parse(parking.el.value)||0;
      if(!Number.isFinite(bArea)||bArea<=0||!Number.isFinite(count)||count<1||!Number.isFinite(years)||years<0||!Number.isFinite(pArea)||pArea<0){
        out.replaceChildren(h('div',{class:'notice',role:'alert',text:'مساحت زیربنا، تعداد طبقات، قدمت و مساحت پارکینگ را بررسی کنید.'}));return;
      }
      buildingRate=BUILDING_RATE[bu][structureKey];
      if(bu==='commercial'){
        const level=Math.abs(Number(floor.el.value));
        floorFactor=1-Math.min(level*0.10,.30);
      } else if(bu==='residential'){
        floorFactor=1+Math.max(0,count-5)*.015;
      }
      ageFactor=1-Math.min(years,20)*.02;
      stageFactor=({complete:1,foundation:.1,frame:.3,rough:.5,finish:.8})[stage.el.value];
      const unit=buildingRate*floorFactor*ageFactor*stageFactor;
      buildingTotal=unit*bArea;
      parkingTotal=pArea*(buildingRate*.5)*ageFactor*stageFactor;
      facts.push(
        ['ارزش پایه هر مترمربع اعیانی',money(buildingRate)],
        ['ضریب طبقات',`${fa(floorFactor*100)}٪`],
        ['ضریب قدمت (حداکثر کسر ۴۰٪)',`${fa(ageFactor*100)}٪`],
        ['ضریب مرحله ساخت',`${fa(stageFactor*100)}٪`],
        ['ارزش اعیانی اصلی',money(buildingTotal)],
        ['ارزش پارکینگ و انباری',money(parkingTotal)],
        ['ارزش کل اعیانی',money(buildingTotal+parkingTotal)]
      );
    }
    const total=landTotal+buildingTotal+parkingTotal;
    const inquiryAt = new Date();
    const inquiryId = (globalThis.crypto?.randomUUID?.() || `RV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`);
    let userName = 'کاربر مهمان';
    try {
      const me = await getJson('/api/me');
      if (me.ok && me.data?.user?.displayName) userName = me.data.user.displayName;
    } catch (_) { /* گزارش برای کاربر مهمان نیز قابل چاپ است. */ }
    const dateText = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' }).format(inquiryAt);
    const timeText = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(inquiryAt);
    const result=h('section',{class:'result regional-result',role:'status','aria-live':'polite'},[
      h('header',{class:'regional-print-header'},[
        h('strong',{class:'regional-academy-name',text:'آکادمی وکالت شهرام مختاری'}),
        h('span',{class:'regional-academy-domain',text:'Mokhtari Law Academy | mokhtari.ir'}),
        h('h2',{text:'گزارش استعلام ارزش معاملاتی ملک'})
      ]),
      h('dl',{class:'regional-report-meta'},[
        h('dt',{text:'نام کاربر'}),h('dd',{text:userName}),
        h('dt',{text:'زمان استعلام'}),h('dd',{text:`${dateText} — ${timeText}`}),
        h('dt',{text:'شناسه استعلام'}),h('dd',{text:inquiryId})
      ]),
      h('div',{class:'result-head'},[h('h3',{text:'ارزش معاملاتی برآوردشده ملک'})]),
      h('div',{class:'amount-block'},[h('span',{class:'amount-label',text:'جمع ارزش عرصه و اعیانی'}),h('strong',{class:'amount-value',text:money(total)})]),
      h('dl',{class:'facts'},facts.flatMap(([k,v])=>[h('dt',{text:k}),h('dd',{text:v})])),
      h('p',{class:'muted',text:'مبنای محاسبه: دفترچه ارزش معاملاتی ۱۴۰۵ اداره کل امور مالیاتی فارس، صفحات ۱۴ تا ۱۶ و جدول بلوک‌های شیراز، صفحات ۲۰ تا ۲۳۵.'}),
      h('p',{class:'muted',text:'فضاهای غیرمسقف و مشاعات منظور نشده‌اند. در املاک چندبر، معبر دارای راه عبور با بالاترین ارزش مبناست. اگر ملک مجاور بزرگراه یا مسیل است اما دسترسی از معبر دیگری دارد، عرض و نرخ همان معبر دسترسی را وارد کنید.'}),
      h('p',{class:'notice',text:'این خروجی ارزش معاملاتی مالیاتی است، نه قیمت روز بازار یا قیمت کارشناسی ملک. پیش از استفاده رسمی، بلوک و کاربری را با سند و موقعیت دقیق ملک تطبیق دهید.'}),
      h('button',{class:'btn secondary',type:'button',text:'چاپ گزارش'})
    ]);
    result.querySelector('button').addEventListener('click',()=>{
      document.body.classList.add('printing-regional-report');
      const cleanup=()=>document.body.classList.remove('printing-regional-report');
      window.addEventListener('afterprint',cleanup,{once:true});
      window.print();
      setTimeout(cleanup,1500);
    });
    out.replaceChildren(result);
  });
  return root;
}
