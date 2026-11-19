/**
 * Build a text-only A4 report. The printable sheet is always one A4 page;
 * content is uniformly scaled to fit instead of spilling onto another page.
 */
export function createA4TextReport({ title, rows = [], content = null, filename = 'academy-report' } = {}) {
  const clone = content?.cloneNode?.(true) || null;
  if (clone) {
    clone.querySelectorAll('.regional-report-map-section, .regional-print-header, .regional-report-footer, .regional-report-actions, button, img, svg, canvas, video, iframe, input, select, textarea').forEach((node) => node.remove());
    clone.querySelectorAll('[hidden], [aria-hidden="true"]').forEach((node) => node.remove());
  }
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalizedRows = rows.map(([label, value]) => [clean(label), clean(value)]).filter(([label, value]) => label && value);\n  if (!normalizedRows.some(([label]) => /تاریخ/.test(label))) {\n    normalizedRows.push(['تاریخ و ساعت تهیه گزارش', new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())]);\n  }
  const reportText = [
    'آکادمی وکالت شهرام مختاری',
    'Shahram Mokhtari Law Academy | mokhtari.ir',
    clean(title || 'گزارش محاسبات حقوقی'),
    ...normalizedRows.flatMap(([label, value]) => [label + ': ' + value]),
    clean(clone?.innerText || clone?.textContent || ''),
  ].filter(Boolean).join('\n');
  const rowsHtml = normalizedRows.map(([label, value]) => '<div class="meta-row"><b>' + escapeHtml(label) + '</b><span>' + escapeHtml(value) + '</span></div>').join('');
  const bodyHtml = clone ? clone.outerHTML : '';
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title || 'گزارش آکادمی')}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#182d28;direction:rtl;font-family:Tahoma,Arial,sans-serif}
body{padding:10px}.actions{display:flex;gap:8px;justify-content:center;margin:0 auto 12px}.actions button{padding:9px 15px;border:1px solid #aebfb6;border-radius:8px;background:#f4f7f5;color:#173b37;font:inherit}
.sheet{width:190mm;height:277mm;max-height:277mm;margin:0 auto;overflow:hidden;background:#fff}
.fit-content{width:100%;transform:scale(var(--fit-scale,1));transform-origin:top center}
.report-header{display:flex;align-items:center;justify-content:center;gap:10px;padding:0 0 8px;margin-bottom:10px;border-bottom:2px solid #315e55;text-align:center}
.report-header img{width:15mm;height:15mm;object-fit:contain;flex:none}
.report-brand{display:grid;gap:3px}.report-brand strong{font-size:15pt;color:#173b37}.report-brand span{font-size:8pt;color:#65776f;direction:ltr}
.report-title{margin:8px 0 10px;text-align:center;font-size:12pt;font-weight:700}
.meta{display:grid;grid-template-columns:30mm minmax(0,1fr);gap:4px 8px;padding:8px 10px;margin-bottom:10px;border:1px solid #d5dfda;border-right:3px solid #b28a45;font-size:9pt;line-height:1.7}
.meta-row{display:contents}.meta-row b{color:#405c53}.meta-row span{overflow-wrap:anywhere}
.report-content{font-size:9pt;line-height:1.65;overflow-wrap:anywhere}
.report-content h2,.report-content h3,.report-content h4{font-size:10pt;margin:7px 0 4px;color:#244f49}
.report-content p{margin:5px 0}.report-content dl{display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;margin:6px 0}
.report-content dt{font-weight:700;color:#405c53}.report-content dd{margin:0;overflow-wrap:anywhere}
.report-content .amount-block{display:flex;justify-content:space-between;gap:8px;padding:7px 10px;margin:7px 0;border:1px solid #cbd8d1;background:#f1f5f2}
.report-content .amount-value{font-weight:800;font-size:13pt}.report-content ol,.report-content ul{margin:4px 0;padding-right:20px}
.report-content li{margin:2px 0}.report-content .muted,.report-content .notice{font-size:8pt;line-height:1.55;margin:5px 0}
.report-content table{width:100%;border-collapse:collapse;font-size:8pt}.report-content td,.report-content th{border:1px solid #dce4df;padding:4px;text-align:right}
.report-footer{margin-top:8px;padding-top:5px;border-top:1px solid #d8e1dc;text-align:center;font-size:7pt;color:#718079}
@page{size:A4 portrait;margin:10mm}
@media print{html,body{width:190mm;height:277mm;margin:0!important;padding:0!important}.actions{display:none!important}.sheet{margin:0!important;break-after:avoid!important;page-break-after:avoid!important}.report-content,.meta,.report-header{break-inside:avoid;page-break-inside:avoid}}
</style></head><body>
<div class="actions"><button type="button" id="print">چاپ / ذخیره PDF</button><button type="button" id="download">دانلود فایل متنی TXT</button></div>
<main class="sheet"><div class="fit-content" id="fit"><header class="report-header"><img src="/assets/favicon.svg" alt="لوگوی آکادمی"><div class="report-brand"><strong>آکادمی وکالت شهرام مختاری</strong><span>Shahram Mokhtari Law Academy · mokhtari.ir</span></div></header><h1 class="report-title">${escapeHtml(title || 'گزارش محاسبات حقوقی')}</h1>${rowsHtml ? '<section class="meta">' + rowsHtml + '</section>' : ''}<section class="report-content">${bodyHtml}</section><footer class="report-footer">آکادمی وکالت شهرام مختاری | mokhtari.ir</footer></div></main>
<script>
const fit=document.getElementById('fit'),sheet=document.querySelector('.sheet');
function fitOnePage(){fit.style.setProperty('--fit-scale','1');const available=sheet.clientHeight;const needed=fit.scrollHeight;const scale=Math.min(1,available/Math.max(1,needed));fit.style.setProperty('--fit-scale',String(scale));}
document.getElementById('print').addEventListener('click',()=>{fitOnePage();window.print();});
document.getElementById('download').addEventListener('click',()=>{const text=${JSON.stringify(reportText)};const blob=new Blob(['\\uFEFF'+text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=${JSON.stringify(filename+'.txt')};document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);});
window.addEventListener('load',()=>{fitOnePage();setTimeout(fitOnePage,250);});
</script></body></html>`;
  const popup = window.open('', '_blank');
  if (!popup) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename + '.html'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    return;
  }
  popup.document.open(); popup.document.write(html); popup.document.close();
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
