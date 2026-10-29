/* انتخاب پوسته رنگی. کلاسیک (بدون ماژول) تا پیش از رندر صفحه اعمال شود.
   انتخاب کاربر فقط در مرورگر همین دستگاه ذخیره می‌شود؛ هیچ داده‌ای به سرور نمی‌رود. */
(function () {
  var KEY = 'wefagh-theme';
  var THEMES = { green: '#134e44', navy: '#1b2a4a', pencil: '#4b4b48' };

  function read() {
    try {
      var v = window.localStorage.getItem(KEY);
      return Object.prototype.hasOwnProperty.call(THEMES, v) ? v : 'green';
    } catch (e) {
      return 'green';
    }
  }

  function save(name) {
    try {
      window.localStorage.setItem(KEY, name);
    } catch (e) {
      // حافظه در دسترس نیست (حالت خصوصی): پوسته برای همین بازدید اعمال می‌شود.
    }
  }

  function apply(name) {
    var root = document.documentElement;
    if (name === 'green') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', name);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEMES[name]);
    var buttons = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-theme-choice') === name));
    }
  }

  window.wefaghTheme = {
    current: read,
    set: function (name) {
      if (!Object.prototype.hasOwnProperty.call(THEMES, name)) return;
      save(name);
      apply(name);
    }
  };

  apply(read());
  document.addEventListener('DOMContentLoaded', function () { apply(read()); });
  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-theme-choice]') : null;
    if (target) window.wefaghTheme.set(target.getAttribute('data-theme-choice'));
  });
})();
