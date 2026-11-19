/** Academy-branded A4 worksheets for calculator results. */
export function createA4TextReport({ title, rows = [], content = null, filename = 'academy-report', downloadOnly = false } = {}) {
  const clone = content?.cloneNode?.(true) || null;
  if (clone) {
    clone.querySelectorAll('.regional-report-map-section,.regional-print-header,.regional-report-footer,.regional-report-actions,button,img,svg,canvas,video,iframe,input,select,textarea').forEach(n => n.remove());
    clone.querySelectorAll('[hidden],[aria-hidden="true"]').forEach(n => n.remove());
  }
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const data = rows.map(([a, b]) => [clean(a), clean(b)]).filter(([a, b]) => a && b);
  if (!data.some(([a]) => /تاریخ/.test(a))) data.push(['تاریخ تنظیم', new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())]);
  const brand = 'آکادمی وکالت شهرام مختاری';
  const text = [brand, 'Shahram Mokhtari Law Academy | mokhtari.ir', clean(title), ...data.flatMap(([a, b]) => [a + ': ' + b]), clean(clone?.innerText || clone?.textContent || '')].filter(Boolean).join('\n');
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

  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const fields = data.map(([label, value]) => '<div class="academy-pdf-field"><b>' + escape(label) + '</b><span>' + escape(value) + '</span></div>').join('');
  const body = clone?.innerHTML || '';
  const html = '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escape(title || 'کاربرگ محاسباتی') +
    '</title><link rel="stylesheet" href="/css/styles.css?v=20261119-pdf-csp-1"></head><body class="academy-pdf-body">' +
    '<main class="academy-pdf-sheet"><header class="academy-pdf-header"><div><strong>' + brand +
    '</strong><small>Shahram Mokhtari Law Academy · mokhtari.ir</small></div><img src="/assets/favicon.svg" alt="لوگوی آکادمی"></header>' +
    '<h1>' + escape(title || 'فرم محاسبات حقوقی') +
    '</h1><section class="academy-pdf-section"><b class="academy-pdf-section-title">۱. مشخصات پرونده و داده‌های پایه محاسبه</b><div class="academy-pdf-fields">' + fields +
    '</div></section><section class="academy-pdf-section"><b class="academy-pdf-section-title">۲. شرح محاسبه و نتیجه</b><div class="academy-pdf-content">' + body +
    '</div></section><div class="academy-pdf-sign"><div>نام و نام خانوادگی تنظیم‌کننده:<span></span></div><div>امضاء و تاریخ:<span></span></div></div>' +
    '<footer class="academy-pdf-footer">' + brand + ' | کاربرگ آموزشی و کاربردی محاسبات حقوقی | mokhtari.ir</footer></main></body></html>';

  // Open synchronously during the user's click so Safari does not block the tab.
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('مرورگر پنجره گزارش را مسدود کرد. اجازه بازشدن پنجره برای این سایت را فعال کنید و دوباره تلاش کنید.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();

  const loadPdfLibrary = () => {
    if (window.html2pdf) return Promise.resolve();
    if (window.__academyPdfLoader) return window.__academyPdfLoader;
    window.__academyPdfLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
      script.onload = () => window.html2pdf ? resolve() : reject(new Error('html2pdf global missing'));
      script.onerror = () => reject(new Error('PDF library blocked or unavailable'));
      document.head.append(script);
    });
    return window.__academyPdfLoader;
  };

  (async () => {
    try {
      await Promise.all([
        loadPdfLibrary(),
        new Promise((resolve, reject) => {
          const link = popup.document.querySelector('link[rel="stylesheet"]');
          if (link?.sheet) return resolve();
          if (!link) return reject(new Error('Report stylesheet missing'));
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', () => reject(new Error('Report stylesheet failed')), { once: true });
        })
      ]);
      if (popup.closed) throw new Error('Report window was closed');
      const sheet = popup.document.querySelector('.academy-pdf-sheet');
      await window.html2pdf().set({
        margin: 0,
        filename: filename + '.pdf',
        image: { type: 'jpeg', quality: .98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: Math.max(sheet.scrollWidth, sheet.clientWidth) },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(sheet).save();
    } catch (error) {
      console.error('[academy-report] PDF generation failed', error);
      if (!popup.closed) {
        const notice = popup.document.createElement('p');
        notice.className = 'academy-pdf-error';
        notice.textContent = 'تولید خودکار PDF انجام نشد. اتصال اینترنت و امکان بارگذاری کتابخانه PDF را بررسی کنید.';
        popup.document.body.prepend(notice);
      }
    }
  })();
}

