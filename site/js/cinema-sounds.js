/* Optional, opt-in interface sounds. Uses synthesized tones; no audio files or autoplay. */
const label = 'فعال‌سازی صدای محیط';
const button = document.createElement('button');
button.type = 'button';
button.className = 'cinema-sound-toggle';
button.setAttribute('aria-pressed', 'false');
button.textContent = '♪ ' + label;
button.setAttribute('aria-label', label);
document.body.append(button);

let enabled = false;
let audioContext;
let lastPlayed = 0;

function tone(frequency = 620, duration = .045, volume = .025) {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastPlayed < 90) return;
  lastPlayed = now;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Audio is decorative; it must never affect navigation or forms. */ }
}

button.addEventListener('click', () => {
  enabled = !enabled;
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? '♪ صدای محیط: روشن' : '♪ ' + label;
  if (enabled) tone(740, .09, .035);
});
document.addEventListener('click', (event) => {
  if (!enabled || event.target.closest('.cinema-sound-toggle')) return;
  if (event.target.closest('a,button,[role="button"]')) tone(520, .035, .018);
}, { passive: true });
