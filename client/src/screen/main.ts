/**
 * Free Burning Cars – obrazovka (PC / TV). Tady běží celá hra; telefony jen posílají vstupy přes server.
 *
 * Tenhle soubor jen všechno propojí: vytvoří App, zaregistruje obrazovky a spustí hlavní smyčku.
 *   app.ts        společný kontext (grafika, zvuk, simulace na pozadí, přepínání obrazovek)
 *   session.ts    hráči a spojení s ovladači
 *   screens/      lobby → výběr tratě → výběr aut → výběr zbraně → závod (+ výsledky) → výběr tratě …
 */
import { keepScreenAwake } from '../shared/wakeLock';
import { $, App } from './app';
import { loadPreviews } from './previews';
import { CarSelectScreen } from './screens/carSelect';
import { GunSelectScreen } from './screens/gunSelect';
import { LobbyScreen } from './screens/lobby';
import { RaceScreen } from './screens/race';
import { TrackSelectScreen } from './screens/trackSelect';

const app = new App($('game') as HTMLCanvasElement);
// při hraní se myš ani klávesnice nehnou – ať počítač nezhasne obrazovku
keepScreenAwake();
const trackSelect = new TrackSelectScreen(app);
app.register('lobby', new LobbyScreen(app));
app.register('track', trackSelect);
app.register('cars', new CarSelectScreen(app));
app.register('guns', new GunSelectScreen(app));
app.register('race', new RaceScreen(app));

// náhledy tratí (poprvé se vyrenderují, příště se vezmou z úložiště prohlížeče)
trackSelect.previews = loadPreviews(app, app.settings.trackIdx);
app.show('lobby');
$('boot').remove();

// ------------------------------------------------------------------ klávesnice
const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'];
window.addEventListener('keydown', (e) => {
  app.audio.unlock();
  if (e.code !== 'Escape' && e.code !== 'F11') goFullscreen();
  if (SCROLL_KEYS.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  app.keys.add(e.code);

  // platí všude
  if (e.code === 'KeyG') {
    app.view.setQuality(app.view.quality === 'high' ? 'low' : 'high');
    app.autoQuality = false;
    app.toast('Grafika: ' + (app.view.quality === 'high' ? 'vysoká (stíny)' : 'nízká (rychlejší)'));
  }
  if (e.code === 'KeyM') app.toast(app.audio.toggleMute() ? 'Zvuk vypnutý' : 'Zvuk zapnutý');
  // zbytek řeší právě zobrazená obrazovka
  app.key(e);
});
window.addEventListener('keyup', (e) => app.keys.delete(e.code));
window.addEventListener('blur', () => app.keys.clear());
window.addEventListener('pointerdown', () => { app.audio.unlock(); goFullscreen(); });

// ------------------------------------------------------------------ celá obrazovka
// Prohlížeč dovolí přepnout na celou obrazovku jen po kliknutí / stisku klávesy,
// proto to zkoušíme při každé interakci, dokud na celé obrazovce nejsme.
function isFullscreen(): boolean {
  // F11 v prohlížeči nenastaví fullscreenElement, ale okno je pak velké jako monitor
  return !!document.fullscreenElement || (window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2);
}
function goFullscreen() {
  if (isFullscreen() || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* bez interakce to prohlížeč nepovolí */ });
}
function updateFsHint() { $('fs-hint').style.display = isFullscreen() ? 'none' : ''; }
document.addEventListener('fullscreenchange', updateFsHint);
window.addEventListener('resize', updateFsHint);
updateFsHint();

// ------------------------------------------------------------------ hlavní smyčka
let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (dt > 0) app.frame(dt);
}
requestAnimationFrame(frame);

// pro ladění z konzole prohlížeče: fbc.sim, fbc.view, fbc.session.players, fbc.show('track')…
(window as unknown as Record<string, unknown>).fbc = app;
