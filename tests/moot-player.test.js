// پخش‌کنندهٔ صدا با یک Audio ساختگی که سیاست iOS را مدل می‌کند (Node پخش واقعی ندارد).
// این تست فقط منطق createPlayer را می‌سنجد؛ رفتار واقعی Safari آیفون فقط روی دستگاه واقعی قابل اثبات است.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeAudio {
  static instances = [];
  constructor() {
    this.paused = true;
    this.src = '';
    this._volume = 1;
    this.volumeLocked = FakeAudio.volumeLocked;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.listeners = {};
    this.log = [];
    this.playGate = null;
    FakeAudio.instances.push(this);
  }
  get volume() { return this._volume; }
  set volume(v) { if (!this.volumeLocked) this._volume = v; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  pause() { this.paused = true; this.log.push(`pause:${this.src}`); }
  async play() {
    this.log.push(`play:${this.src}`);
    if (this.src.includes('rejected-not-allowed')) throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    if (this.src.includes('rejected-abort')) throw Object.assign(new Error('x'), { name: 'AbortError' });
    if (this.src.includes('rejected-other')) throw Object.assign(new Error('x'), { name: 'NotSupportedError' });
    if (this.playGate) await this.playGate;
    this.paused = false;
  }
}

let urlCounter = 0;
globalThis.Audio = FakeAudio;
const realCreate = URL.createObjectURL;
URL.createObjectURL = (blob) => `blob:test/${blob.type}-${++urlCounter}-${blob.size}${blob.tag || ''}`;
URL.revokeObjectURL = () => {};
process.on('exit', () => { URL.createObjectURL = realCreate; });

const { createPlayer, volumeAdjustable } = await import('../site/js/ai-client.js');
const fresh = (opts) => { FakeAudio.volumeLocked = false; const p = createPlayer(opts); return { p, a: p.audio }; };
const blobTagged = (tag) => Object.assign(new Blob(['x'.repeat(100)], { type: 'audio/wav' }), { tag });

test('حجم‌پذیری تشخیص داده می‌شود و مقدار اصلی حجم بازگردانده می‌شود', () => {
  const ok = new FakeAudio();
  ok.volume = 0.8;
  assert.equal(volumeAdjustable(ok), true);
  assert.equal(ok.volume, 0.8);
  FakeAudio.volumeLocked = true;
  const ios = new FakeAudio();
  assert.equal(volumeAdjustable(ios), false);
  FakeAudio.volumeLocked = false;
});

test('در دستگاهی که حجم عنصر صوتی قفل است (iOS) player.volumeSupported برابر false است', () => {
  FakeAudio.volumeLocked = true;
  const p = createPlayer();
  assert.equal(p.volumeSupported, false);
  FakeAudio.volumeLocked = false;
  assert.equal(createPlayer().volumeSupported, true);
});

test('unlock یک WAV بی‌صدا را شروع می‌کند و پس از شروع پخش آن را می‌ایستاند', async () => {
  const { p, a } = fresh();
  p.unlock();
  assert.match(a.src, /audio\/wav/);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(a.paused, true);
  assert.ok(a.log[0].startsWith('play:'));
  assert.ok(a.log.at(-1).startsWith('pause:'));
});

test('unlock هنگام پخش صدای واقعی آن را قطع نمی‌کند و src را عوض نمی‌کند', async () => {
  const { p, a } = fresh();
  await p.play(blobTagged('-real'));
  const before = a.src;
  const logLen = a.log.length;
  p.unlock();
  assert.equal(a.src, before);
  assert.equal(a.log.length, logLen);
  assert.equal(a.paused, false);
});

test('اگر پیش از حل‌شدن play بی‌صدا، صدای واقعی جایگزین شود، توقف بی‌صدا صدای واقعی را قطع نمی‌کند', async () => {
  const { p, a } = fresh();
  let release;
  a.playGate = new Promise((r) => { release = r; });
  p.unlock();
  const playing = p.play(blobTagged('-real'));
  a.playGate = null;
  release();
  await playing;
  await new Promise((r) => setTimeout(r, 0));
  assert.match(a.src, /-real/);
  assert.equal(a.paused, false, 'صدای واقعی نباید توسط pause مربوط به unlock متوقف شود');
});

test('play سرعت انتخابی را پس از تغییر src دوباره اعمال می‌کند و بین صداها نگه می‌دارد', async () => {
  const { p, a } = fresh();
  p.setRate(1.5);
  assert.equal(a.defaultPlaybackRate, 1.5);
  a.playbackRate = 1;
  assert.deepEqual(await p.play(blobTagged('-1')), { ok: true });
  assert.equal(a.playbackRate, 1.5);
  a.playbackRate = 1;
  await p.play(blobTagged('-2'));
  assert.equal(a.playbackRate, 1.5);
  assert.equal(p.setRate(9), 2);
  assert.equal(p.setRate(0.1), 0.5);
  assert.equal(p.setRate('abc'), 1);
});

test('خطاهای پخش به سه کد جدا نگاشت می‌شوند', async () => {
  const { p } = fresh();
  assert.deepEqual(await p.play(blobTagged('rejected-not-allowed')), { ok: false, error: 'NOT_ALLOWED' });
  assert.deepEqual(await p.play(blobTagged('rejected-abort')), { ok: false, error: 'ABORTED' });
  assert.deepEqual(await p.play(blobTagged('rejected-other')), { ok: false, error: 'PLAY_FAILED' });
});

test('stop پخش را می‌ایستاند و ended به onEnded می‌رسد', async () => {
  let ended = 0;
  const { p, a } = fresh({ onEnded: () => { ended += 1; } });
  await p.play(blobTagged('-x'));
  p.stop();
  assert.equal(a.paused, true);
  a.listeners.ended();
  assert.equal(ended, 1);
});
