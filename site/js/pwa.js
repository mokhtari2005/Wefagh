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


// Offer Push activation on the first standalone launch (permission remains user-controlled).
function decodePushKey(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
async function offerPushActivation() {
  if (!isStandalone() || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if (Notification.permission === 'denied' || localStorage.getItem('mla-push-onboarding-enabled') === '1') return;
  const snoozeUntil = Number(localStorage.getItem('mla-push-onboarding-snooze-until') || 0);
  if (snoozeUntil > Date.now()) return;
  try {
    const me = await fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!me.ok) return;
    const keyResponse = await fetch('/api/push/public-key', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!keyResponse.ok) return;
    const keyData = await keyResponse.json();
    if (!keyData?.publicKey) return;
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const check = await fetch('/api/push/subscription?endpoint=' + encodeURIComponent(existing.endpoint), { credentials: 'same-origin' });
      if (check.ok && (await check.json()).active) return;
    }

    const panel = document.createElement('section');
    panel.className = 'pwa-push-onboarding';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'فعال‌سازی اعلان‌های آکادمی');
    const heading = document.createElement('strong');
    heading.textContent = 'اعلان‌های آکادمی را فعال کنید';
    const copy = document.createElement('p');
    copy.textContent = 'برای دریافت یادآوری مواعد و اعلان‌های مهم، اجازهٔ ارسال اعلان را صادر کنید.';
    const enable = document.createElement('button');
    enable.type = 'button';
    enable.textContent = 'فعال‌سازی اعلان‌ها';
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'pwa-push-later';
    later.textContent = 'بعداً';
    const status = document.createElement('small');
    status.setAttribute('role', 'status');
    panel.append(heading, copy, enable, later, status);
    document.body.append(panel);

    const close = () => panel.remove();
    later.addEventListener('click', () => {
      localStorage.setItem('mla-push-onboarding-snooze-until', String(Date.now() + 24 * 60 * 60 * 1000));
      close();
    });
    enable.addEventListener('click', async () => {
      enable.disabled = true;
      status.textContent = 'در حال فعال‌سازی…';
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          status.textContent = 'اجازهٔ اعلان صادر نشد. می‌توانید بعداً از تنظیمات مرورگر آن را تغییر دهید.';
          enable.disabled = false;
          return;
        }
        const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodePushKey(keyData.publicKey)
        });
        const saved = await fetch('/api/push/subscription', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(subscription.toJSON())
        });
        if (!saved.ok) throw new Error('subscription-save-failed');
        status.textContent = 'اعلان‌های آکادمی با موفقیت فعال شد.';
        localStorage.setItem('mla-push-onboarding-enabled', '1');
        window.setTimeout(close, 1400);
      } catch {
        status.textContent = 'فعال‌سازی کامل نشد. از صفحهٔ مواعد دوباره تلاش کنید.';
        enable.disabled = false;
      }
    });
  } catch (error) {
    console.warn('Push onboarding could not be initialized.', error);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.setTimeout(offerPushActivation, 900), { once: true });
} else {
  window.setTimeout(offerPushActivation, 900);
}

window.addEventListener('hashchange', () => window.setTimeout(offerPushActivation, 700));
