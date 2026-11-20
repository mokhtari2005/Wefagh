import { renderFormHtml, renderFormText } from './forms.js?v=20261121-mla-brand-1';

/** Wait for the report stylesheet to finish loading; link.sheet alone is set before CSS is ready. */
function waitForStylesheet(doc) {
  const link = doc.querySelector('link[rel="stylesheet"]');
  if (!link) return Promise.reject(new Error('Report stylesheet missing'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      link.removeEventListener('load', onLoad);
      link.removeEventListener('error', onError);
      error ? reject(error) : resolve();
    };
    const onLoad = () => finish();
    const onError = () => finish(new Error('Report stylesheet failed'));
    const timeout = setTimeout(() => {
      try {
        if (link.sheet && link.sheet.cssRules.length > 0) finish();
        else finish(new Error('Report stylesheet timed out'));
      } catch {
        finish(new Error('Report stylesheet could not be read'));
      }
    }, 15000);
    link.addEventListener('load', onLoad, { once: true });
    link.addEventListener('error', onError, { once: true });
    // A cached stylesheet may have completed before the listeners were attached.
    try {
      if (link.sheet && link.sheet.cssRules.length > 0) queueMicrotask(() => finish());
    } catch {
      // Same-origin report CSS should be readable; the load event remains the fallback.
    }
  });
}

/** Load a PDF dependency in the report window and resolve only after its global is available. */
function loadReportScript(win, src, getGlobal) {
  const existing = getGlobal();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = win.document.createElement('script');
    script.src = src;
    script.onload = () => {
      const loaded = getGlobal();
      loaded ? resolve(loaded) : reject(new Error('PDF library global missing: ' + src));
    };
    script.onerror = () => reject(new Error('PDF library blocked or unavailable: ' + src));
    win.document.head.append(script);
  });
}

/** Wait for report images so the logo is included in the exported file. */
async function waitForReportImages(root) {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async (img) => {
    if (!img.complete) {
      await new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }
    if (img.decode) await img.decode().catch(() => {});
  }));
}

/** Academy-branded calculator report. Every PDF is fitted proportionally onto one A4 page. */
export function createA4TextReport({ title, rows = [], content = null, filename = 'academy-report', downloadOnly = false, model = null } = {}) {
  const clone = content?.cloneNode?.(true) || null;
  if (clone) {
    clone.querySelectorAll('.regional-report-map-section,.regional-print-header,.regional-report-footer,.regional-report-actions,button,img,svg,canvas,video,iframe,input,select,textarea').forEach(n => n.remove());
    clone.querySelectorAll('[hidden],[aria-hidden="true"]').forEach(n => n.remove());
  }
  const clean = v => String(v ?? '').replace(/\\s+/g, ' ').trim();
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
    const blob = new Blob(['\\uFEFF' + renderFormText(form, dateText)], { type: 'text/plain;charset=utf-8' });
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

  const html = renderFormHtml(form, { dateText, cssHref: '/css/styles.css?v=20261121-mla-brand-1' });

  // Open synchronously during the user's click so Safari does not block the report tab.
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('مرورگر پنجره گزارش را مسدود کرد. اجازه بازشدن پنجره برای این سایت را فعال کنید و دوباره تلاش کنید.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();

  (async () => {
    try {
      const [html2canvas, jsPDF] = await Promise.all([
        waitForStylesheet(popup.document).then(() => loadReportScript(
          popup,
          'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
          () => popup.html2canvas
        )),
        loadReportScript(
          popup,
          'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
          () => popup.jspdf?.jsPDF
        ),
      ]);
      if (popup.closed) throw new Error('Report window was closed');
      const sheet = popup.document.querySelector('.academy-pdf-sheet');
      if (!sheet) throw new Error('Report sheet missing');
      await popup.document.fonts?.ready;
      await waitForReportImages(sheet);

      // Capture the actual, fully styled report instead of racing html2pdf's iframe clone.
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: Math.max(sheet.scrollWidth, sheet.clientWidth),
        windowHeight: Math.max(sheet.scrollHeight, sheet.clientHeight),
        scrollX: 0,
        scrollY: 0,
      });
      if (!canvas.width || !canvas.height) throw new Error('PDF report rendered an empty canvas');

      // Preserve the whole report and its proportions inside the printable A4 area.
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      const fit = Math.min(usableWidth / canvas.width, usableHeight / canvas.height);
      const imageWidth = canvas.width * fit;
      const imageHeight = canvas.height * fit;
      const x = (pageWidth - imageWidth) / 2;
      const y = margin;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      pdf.setProperties({ title: clean(title) || form.title || 'گزارش محاسبات حقوقی' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', x, y, imageWidth, imageHeight, undefined, 'FAST');
      pdf.save(filename + '.pdf');
      canvas.width = 0;
      canvas.height = 0;
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
