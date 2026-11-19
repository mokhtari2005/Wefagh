import { renderFormHtml, renderFormText } from './forms.js?v=20261119-forms-1';

/** Academy-branded A4 worksheets for calculator results. `model` (from forms.js) gives the reference-form layout; without it a generic form is built from rows + content. */
export function createA4TextReport({ title, rows = [], content = null, filename = 'academy-report', downloadOnly = false, model = null } = {}) {
  const clone = content?.cloneNode?.(true) || null;
  if (clone) {
    clone.querySelectorAll('.regional-report-map-section,.regional-print-header,.regional-report-footer,.regional-report-actions,button,img,svg,canvas,video,iframe,input,select,textarea').forEach(n => n.remove());
    clone.querySelectorAll('[hidden],[aria-hidden="true"]').forEach(n => n.remove());
  }
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const dateText = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' }).format(new Date());
  let form = model;
  if (!form) {
    const data = rows.map(([a, b]) => [clean(a), clean(b)]).filter(([a, b]) => a && b);
    form = {
      title: clean(title) || 'فرم محاسبات حقوقی',
      sections: [
        { type: 'fields', title: 'مشخصات پرونده و داده‌های پایه محاسبه', rows: data },
        { type: 'html', title: 'شرح محاسبه و نتیجه', html: clone?.innerHTML || '' },
      ],
      total: null,
      extraTotals: [],
    };
  }
  if (downloadOnly) {
    const blob = new Blob(['\uFEFF' + renderFormText(form, dateText)], { type: 'text/plain;charset=utf-8' });
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

  const html = renderFormHtml(form, { dateText, cssHref: '/css/styles.css?v=20261119-print-2' });

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
      if (!sheet) throw new Error('Report sheet missing');
      // اندازهٔ قلم را فقط در گزارش چاپی و حداکثر در دو پله کاهش می‌دهیم.
      // ارتفاع ثابت A4 باعث می‌شود سرریز واقعی محتوا قابل اندازه‌گیری باشد.
      const fitReportToA4 = async () => {
        const nextFrame = () => new Promise(resolve => popup.requestAnimationFrame(resolve));
        await nextFrame();
        if (sheet.scrollHeight > sheet.clientHeight + 2) {
          sheet.classList.add('fit-compact-1');
          await nextFrame();
        }
        if (sheet.scrollHeight > sheet.clientHeight + 2) {
          sheet.classList.add('fit-compact-2');
          await nextFrame();
        }
      };
      await fitReportToA4();
      const fitContent = sheet.querySelector('.academy-pdf-fit-content');
      if (fitContent) {
        // First and second compact type steps; preserve all text and avoid a second PDF page.
        const available = sheet.clientHeight - parseFloat(getComputedStyle(sheet).paddingTop) - parseFloat(getComputedStyle(sheet).paddingBottom);
        const measure = () => fitContent.getBoundingClientRect().height;
        if (measure() > available) sheet.classList.add('fit-1');
        if (measure() > available) sheet.classList.add('fit-2');
        if (measure() > available) {
          const ratio = Math.max(0.72, available / measure());
          fitContent.style.transform = `scaleY(${ratio})`;
          fitContent.style.height = `${100 / ratio}%`;
        }
      }
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

