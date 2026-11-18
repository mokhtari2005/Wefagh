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
  const province = input('rv-province', 'استان', 'فارس');
  const city = input('rv-city', 'شهر', 'شیراز');
  province.el.value = 'فارس';
  city.el.value = 'شیراز';
  province.el.readOnly = true;
  city.el.readOnly = true;
  const address = input('rv-address', 'نشانی دقیق ملک');
  const postalCode = input('rv-postal-code', 'کد پستی ده‌رقمی');
  postalCode.el.maxLength = 10;
  postalCode.el.inputMode = 'numeric';
  postalCode.el.autocomplete = 'postal-code';
  postalCode.el.addEventListener('input', () => {
    postalCode.el.value = postalCode.el.value.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\\D/g, '').slice(0, 10);
  });
  const postalSearchButton = h('button', { type: 'button', class: 'btn secondary regional-postal-search', text: 'یافتن موقعیت روی نقشه' });
  const postalSearchStatus = h('p', { class: 'muted regional-postal-status', role: 'status', 'aria-live': 'polite' });
  const coordinates = input('rv-coordinates', 'مختصات جغرافیایی (عرض، طول)');
  coordinates.el.readOnly = false;
  coordinates.el.placeholder = 'پس از انتخاب روی نقشه، مختصات اینجا ثبت می‌شود؛ در صورت نیاز دستی وارد کنید.';
  const mapStatus = h('p', { class: 'muted regional-map-status', role: 'status', text: 'برای تعیین موقعیت، روی نقشه کلیک کنید یا نشانگر را جابه‌جا کنید.' });
  const mapCanvas = h('div', { id: 'rv-map', class: 'regional-property-map', role: 'application', 'aria-label': 'نقشه تعیین موقعیت ملک در شیراز' });
  const locationFields = h('section', { class: 'regional-location-fields' }, [
    h('h3', { text: 'موقعیت و نشانی ملک' }),
    province.node, city.node, address.node,
    h('div', { class: 'field regional-postal-field' }, [h('label', { for: 'rv-postal-code', text: 'کد پستی ده‌رقمی (اختیاری)' }), postalCode.el, postalSearchButton, postalSearchStatus]),
    h('div', { class: 'field regional-map-field' }, [h('label', { text: 'نقشه شهر و تعیین موقعیت ملک' }), mapCanvas, mapStatus]),
    coordinates.node
  ]);
  let regionalMap = null;
  let regionalMarker = null;
  let fallbackMapFrame = null;
  const defaultPoint = [29.5918, 52.5837];
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet global missing'));
      script.onerror = () => reject(new Error('Leaflet script failed'));
      document.head.append(script);
    });
  }
  function showMapFallback(reason) {
    // Keep a visible map even when Leaflet/CDN or raster tile requests are blocked.
    mapCanvas.replaceChildren();
    regionalMap = null;
    regionalMarker = null;
    const frame = h('iframe', {
      title: 'نمای نقشه شیراز و موقعیت تقریبی ملک',
      src: 'https://maps.google.com/maps?q=29.5918,52.5837&z=13&output=embed',
      loading: 'lazy',
      referrerpolicy: 'no-referrer-when-downgrade',
      allowfullscreen: ''
    });
    frame.style.cssText = 'display:block;width:100%;height:100%;min-height:260px;border:0;border-radius:11px;';
    mapCanvas.append(frame);
    fallbackMapFrame = frame;
    coordinates.el.readOnly = false;
    mapStatus.textContent = reason || 'نمای جایگزین نقشه فعال شد. این نما برای مشاهده است؛ مختصات ملک را در کادر مختصات دستی وارد کنید.';
  }
  function loadStylesheet(url) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => { link.remove(); reject(new Error('Leaflet stylesheet failed')); };
      document.head.append(link);
    });
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (window.__regionalLeafletPromise) return window.__regionalLeafletPromise;
    window.__regionalLeafletPromise = (async () => {
      const cdns = [
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
        'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      ];
      const cssCdns = [
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
        'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      ];
      let cssLoaded = false;
      for (const url of cssCdns) {
        try { await loadStylesheet(url); cssLoaded = true; break; } catch (_) {}
      }
      if (!cssLoaded) {
        // Minimal essential Leaflet layout rules; tiles and controls still render.
        const style = document.createElement('style');
        style.textContent = '.leaflet-container{position:relative;overflow:hidden;outline:0;touch-action:pan-x pan-y}.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-map-pane svg,.leaflet-map-pane canvas,.leaflet-zoom-box{position:absolute;left:0;top:0}.leaflet-container img{max-width:none!important;max-height:none!important}.leaflet-tile{visibility:hidden;user-select:none;-webkit-user-drag:none}.leaflet-tile-loaded{visibility:inherit}.leaflet-control{position:relative;z-index:800;pointer-events:auto}.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}.leaflet-control a{display:block;width:30px;height:30px;line-height:30px;text-align:center;background:#fff;color:#222;text-decoration:none}.leaflet-control-zoom{margin:10px}.leaflet-marker-icon{display:block}.leaflet-pane{z-index:400}.leaflet-tile-pane{z-index:200}.leaflet-overlay-pane{z-index:400}.leaflet-shadow-pane{z-index:500}.leaflet-marker-pane{z-index:600}.leaflet-tooltip-pane{z-index:650}.leaflet-popup-pane{z-index:700}';
        document.head.append(style);
      }
      for (const url of cdns) {
        try { return await loadScript(url); } catch (_) {}
      }
      throw new Error('All Leaflet script CDNs failed');
    })();
    return window.__regionalLeafletPromise;
  }
  loadLeaflet().then(L => {
    regionalMap = L.map(mapCanvas, { scrollWheelZoom: false }).setView(defaultPoint, 13);
    // Use multiple independent raster providers. Some networks block OSM tiles,
    // so a failed provider must not leave the user with a blank map.
    const tileProviders = [
      {
        name: 'Carto',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: { subdomains: 'abcd', maxZoom: 20, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }
      },
      {
        name: 'OpenStreetMap',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
      },
      {
        name: 'Esri',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
      }
    ];
    let activeTiles = null;
    let providerIndex = -1;
    function useTileProvider(index) {
      if (index >= tileProviders.length) {
        showMapFallback('سرویس‌های نقشه تعاملی در این شبکه پاسخ ندادند؛ نمای جایگزین نقشه نمایش داده شد. برای ثبت دقیق موقعیت، مختصات را دستی وارد کنید.');
        return;
      }
      if (activeTiles) regionalMap.removeLayer(activeTiles);
      providerIndex = index;
      const provider = tileProviders[index];
      let errors = 0;
      mapStatus.textContent = `در حال دریافت نقشه از سرویس جایگزین ${index + 1} از ${tileProviders.length}…`;
      activeTiles = L.tileLayer(provider.url, { ...provider.options, crossOrigin: true }).addTo(regionalMap);
      activeTiles.on('tileload', () => {
        if (providerIndex === index) mapStatus.textContent = 'نقشه آماده است؛ محل ملک را انتخاب کنید.';
      });
      activeTiles.on('tileerror', () => {
        if (providerIndex !== index) return;
        errors += 1;
        if (errors >= 3) useTileProvider(index + 1);
      });
    }
    useTileProvider(0);
    regionalMarker = L.marker(defaultPoint, { draggable: true }).addTo(regionalMap);
    const setPoint = async point => {
      const lat = Number(point.lat).toFixed(6), lon = Number(point.lng).toFixed(6);
      coordinates.el.value = `${lat}, ${lon}`;
      mapStatus.textContent = 'موقعیت روی نقشه ثبت شد؛ در صورت نیاز نشانی و کد پستی را دستی تکمیل کنید.';
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=fa`);
        if (response.ok) {
          const data = await response.json();
          if (!address.el.value && data.display_name) address.el.value = data.display_name;
          if (!postalCode.el.value && data.address?.postcode) postalCode.el.value = String(data.address.postcode).replace(/\\D/g, '').slice(0, 10);
        }
      } catch (_) { /* ورود دستی نشانی همچنان ممکن است. */ }
    };
    regionalMap.on('click', event => { regionalMarker.setLatLng(event.latlng); setPoint(event.latlng); });
    regionalMarker.on('dragend', () => setPoint(regionalMarker.getLatLng()));
    [150, 500, 1200].forEach(delay => setTimeout(() => regionalMap?.invalidateSize(), delay));
    window.addEventListener('resize', () => regionalMap?.invalidateSize());
  }).catch(error => {
    console.error('[regional-value] map library failed', error);
    showMapFallback('کتابخانه نقشه تعاملی بارگذاری نشد؛ نمای جایگزین نقشه نمایش داده شد. مختصات را می‌توانید دستی وارد کنید.');
  });
  postalSearchButton.addEventListener('click', async () => {
    const code = postalCode.el.value.replace(/\\D/g, '');
    if (!/^\\d{10}$/.test(code)) {
      postalSearchStatus.textContent = 'کد پستی باید دقیقاً ۱۰ رقم باشد.';
      postalCode.el.focus();
      return;
    }
    if (!regionalMap || !regionalMarker) {
      if (!fallbackMapFrame) {
        postalSearchStatus.textContent = 'نمای نقشه هنوز آماده نیست؛ چند لحظه دیگر دوباره تلاش کنید.';
        return;
      }
      postalSearchButton.disabled = true;
      postalSearchButton.textContent = 'در حال جست‌وجو…';
      postalSearchStatus.textContent = 'در حال جست‌وجوی کد پستی در داده‌های نقشه عمومی…';
      try {
        const params = new URLSearchParams({ format: 'jsonv2', postalcode: code, country: 'Iran', addressdetails: '1', limit: '5' });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Geocoder HTTP ${response.status}`);
        const results = await response.json();
        if (!Array.isArray(results) || !results.length) {
          postalSearchStatus.textContent = 'برای این کد پستی در نقشه عمومی نتیجه‌ای پیدا نشد. مختصات را دستی وارد کنید.';
          return;
        }
        const result = results[0];
        const lat = Number(result.lat), lon = Number(result.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid geocoder coordinates');
        fallbackMapFrame.src = `https://maps.google.com/maps?q=${lat},${lon}&z=17&output=embed`;
        coordinates.el.value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        if (!address.el.value && result.display_name) address.el.value = result.display_name;
        postalSearchStatus.textContent = 'موقعیت پیشنهادی روی نقشه جایگزین نمایش داده شد؛ لطفاً آن را با محل واقعی ملک تطبیق دهید.';
      } catch (error) {
        console.error('[regional-value] postal lookup failed', error);
        postalSearchStatus.textContent = 'جست‌وجوی کد پستی ناموفق بود؛ مختصات را دستی وارد کنید.';
      } finally {
        postalSearchButton.disabled = false;
        postalSearchButton.textContent = 'یافتن موقعیت روی نقشه';
      }
      return;
    }
    postalSearchButton.disabled = true;
    postalSearchButton.textContent = 'در حال جست‌وجو…';
    postalSearchStatus.textContent = 'در حال جست‌وجوی کد پستی در داده‌های نقشه عمومی…';
    try {
      const params = new URLSearchParams({
        format: 'jsonv2', postalcode: code, country: 'Iran', addressdetails: '1', limit: '5'
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Geocoder HTTP ${response.status}`);
      const results = await response.json();
      if (!Array.isArray(results) || !results.length) {
        postalSearchStatus.textContent = 'برای این کد پستی در نقشه عمومی نتیجه‌ای پیدا نشد. نشانی را وارد کنید یا محل ملک را روی نقشه مشخص کنید.';
        return;
      }
      const result = results[0];
      const point = { lat: Number(result.lat), lng: Number(result.lon) };
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) throw new Error('Invalid geocoder coordinates');
      regionalMarker.setLatLng(point);
      regionalMap.setView(point, 17);
      regionalMap.invalidateSize();
      coordinates.el.value = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
      if (!address.el.value && result.display_name) address.el.value = result.display_name;
      postalSearchStatus.textContent = 'موقعیت پیشنهادی پیدا شد. لطفاً نشانگر را با محل واقعی ملک تطبیق دهید؛ کد پستی به‌تنهایی نشانی پلاک را تضمین نمی‌کند.';
    } catch (error) {
      console.error('[regional-value] postal lookup failed', error);
      postalSearchStatus.textContent = 'جست‌وجوی کد پستی موقتاً ناموفق بود. اتصال اینترنت را بررسی کنید یا موقعیت را دستی روی نقشه انتخاب کنید.';
    } finally {
      postalSearchButton.disabled = false;
      postalSearchButton.textContent = 'یافتن موقعیت روی نقشه';
    }
  });
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
    locationFields,
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
        h('dt',{text:'شناسه استعلام'}),h('dd',{text:inquiryId}),
        h('dt',{text:'استان و شهر'}),h('dd',{text:`${province.el.value}، ${city.el.value}`}),
        h('dt',{text:'نشانی ملک'}),h('dd',{text:address.el.value || 'درج نشده'}),
        h('dt',{text:'کد پستی'}),h('dd',{text:postalCode.el.value || 'درج نشده'}),
        h('dt',{text:'مختصات'}),h('dd',{text:coordinates.el.value || 'روی نقشه تعیین نشده'})
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
      // Print an isolated copy so page layout, sticky headers and calculator styles
      // cannot push the report onto a second sheet.
      const sheet = document.createElement('main');
      sheet.className = 'regional-print-sheet';
      const copy = result.cloneNode(true);
      copy.querySelector('button')?.remove();
      sheet.append(copy);
      const printStyle = document.createElement('style');
      printStyle.dataset.regionalPrint = '1';
      printStyle.textContent = `
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body > *:not(.regional-print-sheet):not(style) { display: none !important; }
          .regional-print-sheet {
            display: block !important; position: fixed !important; top: 0 !important; right: 0 !important;
            width: 248mm !important; margin: 0 !important; padding: 0 !important;
            transform: scale(.78); transform-origin: top right;
            direction: rtl !important; color: #172b27 !important;
            font: 8.5pt/1.35 Vazirmatn, Tahoma, sans-serif !important;
          }
          .regional-print-sheet, .regional-print-sheet * { visibility: visible !important; box-sizing: border-box !important; }
          .regional-print-sheet .regional-result { display:block !important; width:100% !important; margin:0 !important;
            padding:0 !important; border:0 !important; box-shadow:none !important; break-inside:avoid !important; }
          .regional-print-sheet .regional-print-header { display:flex !important; flex-direction:column; align-items:center;
            gap:1px; padding:0 0 5px; margin:0 0 6px; border-bottom:2px solid #315e55; text-align:center; }
          .regional-print-sheet .regional-academy-name { font-size:13pt; font-weight:800; }
          .regional-print-sheet .regional-academy-domain { font-size:7.5pt; direction:ltr; }
          .regional-print-sheet .regional-print-header h2 { font-size:11pt; margin:3px 0 0; }
          .regional-print-sheet .regional-report-meta { display:grid !important; grid-template-columns:75px 1fr;
            gap:1px 6px; padding:5px 7px; margin:0 0 6px; border:1px solid #d5dfda; border-radius:5px; font-size:7.5pt; }
          .regional-print-sheet .regional-report-meta dt { font-weight:700; }
          .regional-print-sheet .regional-report-meta dd { margin:0; overflow-wrap:anywhere; }
          .regional-print-sheet .result-head h3 { font-size:9.5pt; margin:4px 0; }
          .regional-print-sheet .amount-block { padding:5px 8px; margin:4px 0; background:#f1f5f2 !important;
            border:1px solid #cbd8d1 !important; color:#173b37 !important; print-color-adjust:exact; }
          .regional-print-sheet .amount-label { font-size:7.5pt; }
          .regional-print-sheet .amount-value { font-size:14pt; }
          .regional-print-sheet .facts { display:grid; grid-template-columns:1fr 1fr; gap:0 12px; margin:4px 0; }
          .regional-print-sheet .facts dt, .regional-print-sheet .facts dd { padding:1px 0; margin:0;
            border-bottom:1px solid #e5ebe7; font-size:7.2pt; line-height:1.3; }
          .regional-print-sheet .muted, .regional-print-sheet .notice { margin:4px 0; padding:4px 6px;
            font-size:7pt; line-height:1.35; }
        }
        @media screen { .regional-print-sheet { display:none !important; } }
      `;
      document.head.append(printStyle);
      document.body.append(sheet);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        sheet.remove();
        printStyle.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      window.print();
      // Safari may not reliably fire afterprint when the print dialog is dismissed.
      setTimeout(cleanup, 30000);
    });
    out.replaceChildren(result);
  });
  // Mount the form: without this, only the heading and introduction render.
  root.append(form);
  return root;
}
