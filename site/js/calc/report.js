/** Academy-branded one-page A4 worksheets for calculator results. */
export function createA4TextReport({ title, rows = [], content = null, filename = 'academy-report', downloadOnly = false } = {}) {
  const clone = content?.cloneNode?.(true) || null;
  if (clone) {
    clone.querySelectorAll('.regional-report-map-section,.regional-print-header,.regional-report-footer,.regional-report-actions,button,img,svg,canvas,video,iframe,input,select,textarea').forEach(n => n.remove());
    clone.querySelectorAll('[hidden],[aria-hidden="true"]').forEach(n => n.remove());
  }
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const data = rows.map(([a,b]) => [clean(a),clean(b)]).filter(([a,b]) => a && b);
  if (!data.some(([a]) => /تاریخ/.test(a))) data.push(['تاریخ تنظیم',new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'long',timeStyle:'short'}).format(new Date())]);
  const brand='آکادمی وکالت شهرام مختاری';
  const text=[brand,'Shahram Mokhtari Law Academy | mokhtari.ir',clean(title),...data.flatMap(([a,b])=>[a+': '+b]),clean(clone?.innerText||clone?.textContent||'')].filter(Boolean).join('\n');
  if (downloadOnly) {
    const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename + '.txt';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }
  const fields=data.map(([a,b])=>'<div class="field"><b>'+escapeHtml(a)+'</b><span>'+escapeHtml(b)+'</span></div>').join('');
  const body=clone?.outerHTML||'';
  const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title||'کاربرگ محاسباتی')}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#20312e;direction:rtl;font-family:Tahoma,Arial,sans-serif}body{padding:10px}
.actions{display:flex;gap:8px;justify-content:center;margin:0 auto 12px}.actions button{padding:9px 15px;border:1px solid #aebfb6;border-radius:8px;background:#f4f7f5;color:#173b37;font:inherit}
.sheet{width:190mm;height:277mm;max-height:277mm;margin:auto;overflow:hidden;background:#fff;border:1px solid #c8d2d7;padding:7mm 8mm}.fit{transform:scale(var(--scale,1));transform-origin:top center}
header{display:grid;grid-template-columns:1fr auto;align-items:center;padding-bottom:6px;border-bottom:2px solid #203c55}header strong{font-size:13pt;color:#203c55}header small{display:block;margin-top:3px;font-size:7pt;color:#687a80;direction:ltr}header img{width:13mm;height:13mm;object-fit:contain}
h1{margin:5px 0 8px;text-align:center;font-size:12pt;color:#203c55}
.section{border:1px solid #bdc9cf;border-radius:5px;padding:6px 8px;margin-bottom:7px;break-inside:avoid}.section-title{display:block;margin:-1px 0 5px;padding:3px 7px;background:#203c55;color:white;border-radius:3px;font-size:8pt}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:7.7pt;line-height:1.6}.field{display:grid;grid-template-columns:minmax(26mm,38%) 1fr;gap:5px}.field b{color:#405c53}.field span{border-bottom:1px dotted #c7d0d4;overflow-wrap:anywhere}
.content{font-size:8pt;line-height:1.5;overflow-wrap:anywhere}.content h2,.content h3,.content h4{font-size:9pt;margin:5px 0 3px;color:#203c55}.content p{margin:3px 0}.content dl{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;margin:4px 0}.content dt{font-weight:bold;color:#405c53}.content dd{margin:0;overflow-wrap:anywhere}
.content .amount-block{display:flex;justify-content:space-between;align-items:center;padding:6px 9px;margin:5px 0;border:1.5px solid #203c55;border-radius:4px;background:#f2f5f6}.content .amount-value{font-size:12pt;font-weight:800;color:#203c55}
.content ol,.content ul{margin:3px 0;padding-right:18px}.content li{margin:1px 0}.content .muted,.content .notice{font-size:7pt;line-height:1.4;margin:3px 0;padding:3px 5px}.content .notice{border:1px solid #d8d1bb}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:8px;padding-top:6px;border-top:1px solid #cbd4d8;font-size:7.5pt}.sign span{display:block;padding-top:12px;border-bottom:1px dotted #9aa8ad}
footer{margin-top:6px;padding-top:4px;border-top:1px solid #d8e1dc;text-align:center;font-size:6.5pt;color:#718079}
@page{size:A4 portrait;margin:10mm}@media print{html,body{width:190mm;height:277mm;margin:0!important;padding:0!important}.actions{display:none!important}.sheet{margin:0!important;page-break-after:avoid;break-after:avoid}}
</style></head><body><div class="actions"><button id="pdf">دانلود فایل PDF</button><button id="download">دانلود فایل TXT</button></div>
<main class="sheet"><div class="fit" id="fit"><header><div><strong>${brand}</strong><small>Shahram Mokhtari Law Academy · mokhtari.ir</small></div><img src="/assets/favicon.svg" alt="لوگوی آکادمی"></header>
<h1>${escapeHtml(title||'فرم محاسبات حقوقی')}</h1><section class="section"><b class="section-title">۱. مشخصات پرونده و داده‌های پایه محاسبه</b><div class="fields">${fields}</div></section>
<section class="section"><b class="section-title">۲. شرح محاسبه و نتیجه</b><div class="content">${body}</div></section>
<div class="sign"><div>نام و نام خانوادگی تنظیم‌کننده:<span></span></div><div>امضاء و تاریخ:<span></span></div></div><footer>${brand} | کاربرگ آموزشی و کاربردی محاسبات حقوقی | mokhtari.ir</footer></div></main>
<s<script>
const f=document.getElementById('fit'),s=document.querySelector('.sheet'),pdfButton=document.getElementById('pdf');
function fit(){f.style.setProperty('--scale','1');f.style.setProperty('--scale',String(Math.min(1,s.clientHeight/Math.max(1,f.scrollHeight))))}
function loadPdfLibrary(){
 if(window.html2pdf)return Promise.resolve();
 if(window.__academyPdfLoader)return window.__academyPdfLoader;
 window.__academyPdfLoader=(async()=>{
  for(const src of ['https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js','https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js']){
   try{await new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>{el.remove();reject(new Error('PDF library unavailable'))};document.head.append(el)});if(window.html2pdf)return}catch(_){}
  }
  throw new Error('کتابخانه تولید PDF بارگذاری نشد');
 })();
 return window.__academyPdfLoader;
}
pdfButton.onclick=async()=>{
 const label=pdfButton.textContent;pdfButton.disabled=true;pdfButton.textContent='در حال تولید فایل PDF…';
 try{
  fit();await loadPdfLibrary();
  await window.html2pdf().set({margin:[10,10,10,10],filename:${JSON.stringify(filename+'.pdf')},image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['avoid-all','css','legacy']}}).from(s).save();
 }catch(error){console.error('[academy-report] PDF generation failed',error);pdfButton.textContent='تولید PDF ناموفق بود؛ دوباره تلاش کنید';return}
 finally{pdfButton.disabled=false;if(pdfButton.textContent==='در حال تولید فایل PDF…')pdfButton.textContent=label}
};
document.getElementById('download').onclick=()=>{const b=new Blob(['\\uFEFF'+${JSON.stringify(text)}],{type:'text/plain;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=${JSON.stringify(filename+'.txt')};a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)};
window.onload=()=>{fit();setTimeout(fit,250)};
</script>body></html>`;
  const popup=window.open('','_blank');
  if(!popup){const u=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=filename+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);return}
  popup.document.open();popup.document.write(html);popup.document.close();
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
