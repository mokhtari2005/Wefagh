const INSTALL_EVENT = 'beforeinstallprompt';
let deferredInstall = null;
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIosSafari() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/i.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
}
function showIosInstallGuide() {
  let dialog = document.getElementById('pwa-install-guide');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'pwa-install-guide';
    dialog.className = 'pwa-install-dialog';
    const title = document.createElement('h2');
    title.textContent = 'افزودن آکادمی به صفحهٔ اصلی';
    const steps = document.createElement('ol');
    [
      'در نوار پایین Safari، دکمهٔ اشتراک‌گذاری را لمس کنید.',
      'گزینهٔ «Add to Home Screen» یا «افزودن به صفحهٔ اصلی» را انتخاب کنید.',
      'نام آکادمی را تأیید و روی «Add» بزنید.'
    ].forEach((text) => { const li = document.createElement('li'); li.textContent = text; steps.append(li); });
    const note = document.createElement('p');
    note.textContent = 'پس از افزودن، آیکون آکادمی روی صفحهٔ اصلی آیفون قرار می‌گیرد و برنامه در حالت مستقل و تمام‌صفحه باز می‌شود.';
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'pwa-guide-close'; close.textContent = 'متوجه شدم';
    close.addEventListener('click', () => dialog.close());
    dialog.append(title, steps, note, close);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  if (!dialog.open) dialog.showModal();
}
function addInstallControl() {
  if (isStandalone() || document.getElementById('pwa-install')) return;
  const header = document.querySelector('.header-inner');
  if (!header || (!deferredInstall && !isIosSafari())) return;
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'pwa-install'; button.className = 'pwa-install-button';
  button.textContent = 'نصب اپلیکیشن';
  button.setAttribute('aria-label', 'نصب آکادمی وکالت روی دستگاه');
  button.addEventListener('click', async () => {
    if (!deferredInstall) return showIosInstallGuide();
    const promptEvent = deferredInstall;
    deferredInstall = null;
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    button.remove();
  });
  const account = header.querySelector('.avatar-link');
  if (account) header.insertBefore(button, account); else header.append(button);
}
window.addEventListener(INSTALL_EVENT, (event) => {
  event.preventDefault(); deferredInstall = event; addInstallControl();
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null; document.getElementById('pwa-install')?.remove();
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addInstallControl, { once: true });
else addInstallControl();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.warn('PWA service worker registration failed.', error));
  }, { once: true });
}
