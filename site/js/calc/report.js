import { renderFormHtml, renderFormText } from './forms.js?v=20261119-forms-1';

const SNAPSHOT_PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'direction', 'text-align'];

/** html2canvas draws a copy inside the site page, where inherited site CSS can change colours. Record the report window's computed look before rendering. */
function snapshotComputedStyles(root) {
  const view = root.ownerDocument.defaultView;
  return [root, ...root.querySelectorAll('*')].map((el) => {
    const cs = view.getComputedStyle(el);
    return SNAPSHOT_PROPS.map((prop) => cs.getPropertyValue(prop));
  });
}

/** Writes the recorded styles onto the copy that html2canvas renders, so the PDF matches the report window. */
function applyComputedStyles(doc, snapshot) {
  const root = doc.querySelector('.academy-pdf-sheet');
  if (!root) return;
  [root, ...root.querySelectorAll('*')].forEach((el, i) => {
    const values = snapshot[i];
    if (!values) return;
    SNAPSHOT_PROPS.forEach((prop, j) => el.style.setProperty(prop, values[j], 'important'));
  });
}

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

  const html = renderFormHtml(form, { dateText, cssHref: '/css/styles.css?v=20261119-forms-1' });

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
      const styleSnapshot = snapshotComputedStyles(sheet);
      await window.html2pdf().set({
        margin: 0,
        filename: filename + '.pdf',
        image: { type: 'jpeg', quality: .98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: Math.max(sheet.scrollWidth, sheet.clientWidth), onclone: (doc) => applyComputedStyles(doc, styleSnapshot) },
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

