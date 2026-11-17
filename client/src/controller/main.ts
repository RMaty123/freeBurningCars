/**
 * Free Burning Cars – ovladač (telefon).
 * V závodě: plyn drží hra sama, tlačítka FIRE 1 (kulomet), DRIFT, FIRE 2 (raketa/mina), LEFT, BRAKE, RIGHT.
 * V menu (výběr tratě…): LEFT / SELECT / RIGHT / zpět – co se vybírá, říká obrazovka (HostMsg.menu).
 * Výběr auta: mřížka aut (nabídku s náhledy posílá obrazovka), ťuknutím vybrat, tlačítkem POTVRDIT potvrdit.
 * Stav tlačítek se posílá na obrazovku přes Socket.IO.
 */
import { io } from 'socket.io-client';
import type { CtrlMsg, HostMsg, InputState, Phase } from '../shared/protocol';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function store(key: string, value?: string): string {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key) ?? '';
  } catch { return value ?? ''; }
}

const pid = store('fbc-pid') || store('fbc-pid', Math.random().toString(36).slice(2) + Date.now().toString(36));
const params = new URLSearchParams(location.search);
const nameEl = $<HTMLInputElement>('name'), roomEl = $<HTMLInputElement>('room');
nameEl.value = store('fbc-name');
roomEl.value = (params.get('room') ?? store('fbc-room')).toUpperCase();

const socket = io({ transports: ['websocket', 'polling'] });
let joined = false;
let phase: Phase = 'lobby';
let isMaster = false;
let retryTimer = 0;

// ------------------------------------------------------------------ obrazovky
type ScreenId = 's-join' | 's-lobby' | 's-menu' | 's-cars' | 's-pad' | 's-results';
function show(id: ScreenId) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  // 'landscape' = obrazovky jen na šířku (v režimu na výšku se ukáže výzva k otočení telefonu)
  document.body.classList.toggle('landscape', id === 's-pad' || id === 's-menu' || id === 's-cars');
  // 'playing' = obrazovky s tlačítky přes celou plochu (žádné posouvání stránky prstem)
  document.body.classList.toggle('playing', id === 's-pad' || id === 's-menu');
  if (id !== 's-pad') resetInput();
}

function send(m: CtrlMsg) { socket.emit('ctrl:msg', m); }

function join(auto = false) {
  const name = (nameEl.value.trim() || 'HRÁČ').toUpperCase().slice(0, 12);
  const room = roomEl.value.trim().toUpperCase();
  if (room.length !== 4) { if (!auto) $('join-err').textContent = 'Zadej 4 písmena kódu místnosti z obrazovky.'; return; }
  store('fbc-name', name); store('fbc-room', room);
  $('join-err').textContent = auto ? '' : 'Připojuji…';
  if (!socket.connected) socket.connect(); // po "Odejít ze hry" je socket odpojený (zpráva počká ve frontě)
  socket.emit('ctrl:join', { room, pid, name }, (r: { ok: boolean; error?: string }) => {
    if (r.ok) {
      joined = true;
      $('menu-btn').hidden = false;
      armBack();
      $('offline').hidden = true;
      clearInterval(retryTimer); retryTimer = 0;
      $('join-err').textContent = '';
      if (document.querySelector('.screen.active')?.id === 's-join') show('s-lobby');
    } else if (!joined) {
      $('join-err').textContent = r.error ?? 'Nepodařilo se připojit.';
    }
  });
}

// ------------------------------------------------------------------ celá obrazovka
// Prohlížeč ji povolí jen jako reakci na dotyk. Dokud z ní hráč sám neodejde, zkoušíme ji zapnout při každém dotyku.
// Jakmile ji vypne (menu, gesto Zpět, systémová lišta), přestaneme ji vnucovat – zapnout jde zase v menu.
// iPhone (Safari) celou obrazovku pro stránky neumí – tam pomůže "Přidat na plochu" (manifest + apple meta v HTML).
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsDoc = document as FsDoc;
const fsSupported = !!(document.documentElement.requestFullscreen || (document.documentElement as FsEl).webkitRequestFullscreen);
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
let autoFs = true;
const isFs = () => !!(fsDoc.fullscreenElement || fsDoc.webkitFullscreenElement);

function goFullscreen() {
  if (isFs() || standalone) return;
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => { /* nepovoleno – zkusí se při dalším dotyku */ });
    } else el.webkitRequestFullscreen?.();
  } catch { /* nevadí */ }
}
function exitFullscreen() {
  try {
    if (document.exitFullscreen && fsDoc.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else fsDoc.webkitExitFullscreen?.();
  } catch { /* nevadí */ }
}
function updateFsButton() {
  const b = $('m-fs');
  b.hidden = !fsSupported || standalone;
  b.textContent = isFs() ? 'ZRUŠIT CELOU OBRAZOVKU' : 'CELÁ OBRAZOVKA';
}
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => {
    if (!isFs()) autoFs = false; // hráč z ní odešel sám → už ji nevnucuj
    updateFsButton();
  });
}
// pointerup/touchend/click jsou podle prohlížečů "aktivační" události (pointerdown u dotyku ne)
const onTouch = () => {
  if (autoFs) goFullscreen();
  if (joined) armBack();
};
for (const ev of ['pointerup', 'touchend', 'click']) document.addEventListener(ev, onTouch, { passive: true });

// ------------------------------------------------------------------ menu + tlačítko Zpět
// Do historie vložíme jeden "falešný" krok. Zpět ho spotřebuje a místo opuštění stránky se otevře menu.
function armBack() {
  if ((history.state as { fbc?: string } | null)?.fbc !== 'menu') history.pushState({ fbc: 'menu' }, '');
}
window.addEventListener('popstate', () => {
  if (!joined) return;
  openMenu();
  armBack();
});

function openMenu() {
  resetInput();
  updateFsButton();
  $('menu').hidden = false;
}
function closeMenu() { $('menu').hidden = true; }

function leave() {
  closeMenu();
  joined = false;
  clearInterval(retryTimer); retryTimer = 0;
  resetInput();
  socket.disconnect();
  $('menu-btn').hidden = true;
  $('offline').hidden = true;
  autoFs = false;
  exitFullscreen();
  // po obnovení stránky se nepřipojovat automaticky zpět
  history.replaceState(null, '', location.pathname);
  show('s-join');
  $('join-err').textContent = 'Odpojil ses ze hry. Připojit se jde znovu tlačítkem níž.';
}

$('menu-btn').addEventListener('click', openMenu);
$('m-resume').addEventListener('click', closeMenu);
$('m-fs').addEventListener('click', () => {
  if (isFs()) { autoFs = false; exitFullscreen(); }
  else { autoFs = true; goFullscreen(); }
  closeMenu();
});
$('m-leave').addEventListener('click', leave);

$('join').addEventListener('click', () => {
  autoFs = true;
  goFullscreen();
  join();
});
roomEl.addEventListener('input', () => { roomEl.value = roomEl.value.toUpperCase().replace(/[^A-Z]/g, ''); });
nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') roomEl.focus(); });
roomEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { roomEl.blur(); join(); } });

function rejoinLoop() {
  if (!joined) return;
  $('offline').hidden = false;
  if (!retryTimer) retryTimer = window.setInterval(() => join(true), 1500);
}

socket.on('connect', () => { if (joined) join(true); });
socket.on('disconnect', () => { if (joined) $('offline').hidden = false; });
updateFsButton();
socket.on('host:gone', rejoinLoop);
socket.on('host:back', () => join(true));

// ------------------------------------------------------------------ zprávy z obrazovky
function pips(id: string, n: number) {
  $(id).innerHTML = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('');
}

socket.on('host:msg', (m: HostMsg) => {
  if (m.type === 'state') {
    phase = m.phase;
    isMaster = m.master;
    document.documentElement.style.setProperty('--pc', m.color);
    $('l-name').textContent = m.name;
    $('l-slot').textContent = 'hráč ' + (m.slot + 1);
    $('l-laps').textContent = String(m.laps);
    $('master-box').style.display = m.master && !m.waiting ? '' : 'none';
    const wait = $('l-wait');
    wait.style.display = m.master && !m.waiting ? 'none' : '';
    wait.textContent = m.waiting ? 'Závod právě běží – naskočíš do dalšího.' : 'Čekej, až první hráč vybere trať…';
    $('continue').style.display = m.master ? '' : 'none';
    $('r-wait').style.display = m.master ? 'none' : '';
    if (m.menu) {
      $('mn-title').textContent = m.menu.title;
      $('mn-label').textContent = m.menu.label;
      // kdo nevybírá, vidí místo podrobností, kdo právě vybírá
      $('mn-sub').textContent = m.master ? m.menu.sub : `vybírá ${m.menu.by}`;
      $('s-menu').classList.toggle('locked', !m.master);
    }
    if (m.phase === 'lobby') show('s-lobby');
    else if (m.phase === 'track') show('s-menu');
    else if (m.phase === 'cars') { carState(m.carIdx, m.ready, m.master, m.name); show('s-cars'); }
    else if (m.phase === 'results') show('s-results');
    else show('s-pad');
  } else if (m.type === 'hud') {
    $('p-pos').textContent = String(m.pos);
    $('p-total').textContent = '/' + m.total;
    $('p-lap').textContent = `${m.lap}/${m.laps}`;
    $('p-hp').style.transform = `scaleX(${m.hp})`;
    $('p-nitro').style.transform = `scaleX(${m.nitro})`;
    $('sec-ammo').textContent = (m.sec === 'rocket' ? 'raketa' : 'mina') + ' ×' + m.ammo;
    $('b-sec').classList.toggle('empty', m.ammo === 0);
    const ov = $('pad-overlay');
    ov.classList.toggle('show', m.dead || m.finished);
    ov.classList.toggle('fin', m.finished);
    ov.textContent = m.finished ? `CÍL · ${m.pos}. MÍSTO` : m.dead ? 'ZNIČEN!' : '';
  } else if (m.type === 'catalog') {
    catalogItem(m);
  } else if (m.type === 'buzz') {
    try { navigator.vibrate?.(m.ms); } catch { /* iPhone vibrace neumí */ }
  } else if (m.type === 'kicked') {
    joined = false;
    closeMenu();
    $('menu-btn').hidden = true;
    show('s-join');
    $('join-err').textContent = m.reason;
  }
});

// ------------------------------------------------------------------ lobby tlačítka
const tap = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
tap('laps-dec', () => send({ type: 'laps', dir: -1 }));
tap('laps-inc', () => send({ type: 'laps', dir: 1 }));
tap('start', () => send({ type: 'select' }));
tap('continue', () => send({ type: 'select' }));

// ------------------------------------------------------------------ menu (výběr tratě…)
tap('mn-left', () => send({ type: 'nav', dir: -1 }));
tap('mn-right', () => send({ type: 'nav', dir: 1 }));
tap('mn-select', () => send({ type: 'select' }));
tap('mn-back', () => send({ type: 'back' }));

// ------------------------------------------------------------------ výběr auta
type CatalogMsg = Extract<HostMsg, { type: 'catalog' }>;
const catalog: CatalogMsg[] = [];
let carPick = 0;      // auto zvýrazněné v nabídce
let carReady = false; // už potvrzeno?

/** Přišla (nebo se změnila) jedna položka nabídky → vytvoř / aktualizuj dlaždici. */
function catalogItem(m: CatalogMsg) {
  catalog[m.idx] = m;
  catalog.length = m.total;
  const grid = $('cs-grid');
  let tile = grid.querySelector<HTMLElement>(`[data-i="${m.idx}"]`);
  if (!tile) {
    tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.i = String(m.idx);
    tile.innerHTML = '<img alt="" /><span></span>';
    tile.addEventListener('click', () => {
      if (carReady) return;
      carPick = m.idx; // hned zvýrazni, obrazovka to potvrdí stavem
      renderCars();
      send({ type: 'pick', idx: m.idx });
    });
    // dlaždice drž v pořadí podle indexu, i kdyby zprávy přišly napřeskáčku
    const after = [...grid.children].find((c) => Number((c as HTMLElement).dataset.i) > m.idx);
    grid.insertBefore(tile, after ?? null);
  }
  (tile.querySelector('img') as HTMLImageElement).src = m.img;
  (tile.querySelector('span') as HTMLElement).textContent = m.name;
  for (const c of [...grid.children]) if (Number((c as HTMLElement).dataset.i) >= m.total) c.remove();
  renderCars();
}

function carState(idx: number, ready: boolean, master: boolean, name: string) {
  carPick = idx;
  carReady = ready;
  $('cs-player').textContent = name;
  // zpět na výběr tratě může jen první hráč
  $('cs-back').style.visibility = master ? 'visible' : 'hidden';
  renderCars();
}

function renderCars() {
  for (const t of $('cs-grid').children) t.classList.toggle('on', Number((t as HTMLElement).dataset.i) === carPick);
  const car = catalog[carPick];
  $('cs-ready').hidden = !carReady;
  if (!car) return;
  ($('cs-img') as HTMLImageElement).src = car.img;
  $('cs-carname').textContent = car.name;
  for (const row of $('cs-dstats').querySelectorAll<HTMLElement>('.pips10')) {
    const n = car.ratings[row.dataset.k as keyof CatalogMsg['ratings']];
    row.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
  }
  ($('cs-ready-img') as HTMLImageElement).src = car.img;
  $('cs-ready-car').textContent = car.name;
}

tap('cs-confirm', () => { carReady = true; renderCars(); send({ type: 'ready', on: true }); });
tap('cs-change', () => { carReady = false; renderCars(); send({ type: 'ready', on: false }); });
tap('cs-back', () => send({ type: 'back' }));

// ------------------------------------------------------------------ řízení (multi-touch)
type Key = 'f' | 'd' | 'r' | 'left' | 'b' | 'right';
const input: InputState = { s: 0, b: 0, f: false, r: false, d: false };
let lastSent = '';
let lastSentAt = 0;
const pointers = new Map<number, { x: number; y: number }>();
const pad = $('pad');
// pořadí = mřížka 3 × 2: nahoře FIRE 1 | DRIFT | FIRE 2, dole LEFT | BRAKE | RIGHT
const btns: { el: HTMLElement; key: Key }[] = [
  { el: $('b-fire'), key: 'f' }, { el: $('b-drift'), key: 'd' }, { el: $('b-sec'), key: 'r' },
  { el: $('b-left'), key: 'left' }, { el: $('b-brake'), key: 'b' }, { el: $('b-right'), key: 'right' },
];

function recompute() {
  const down: Record<Key, boolean> = { f: false, d: false, r: false, left: false, b: false, right: false };
  const rects = btns.map((b) => b.el.getBoundingClientRect());
  // hranice sloupců a řádků leží uprostřed mezer, takže mezi tlačítky není hluché místo
  const colA = (rects[0].right + rects[1].left) / 2, colB = (rects[1].right + rects[2].left) / 2;
  const rowY = (rects[1].bottom + rects[4].top) / 2;
  const top = pad.getBoundingClientRect().top;
  for (const p of pointers.values()) {
    if (p.y < top) continue;
    const col = p.x < colA ? 0 : p.x < colB ? 1 : 2;
    const row = p.y < rowY ? 0 : 1;
    down[btns[row * 3 + col].key] = true;
  }
  input.s = (down.right ? 1 : 0) - (down.left ? 1 : 0);
  input.b = down.b ? 1 : 0;
  input.f = down.f; input.r = down.r; input.d = down.d;
  btns.forEach((b) => b.el.classList.toggle('on', down[b.key]));
  flush(false);
}

function flush(force: boolean) {
  if (!joined || (phase !== 'race' && phase !== 'countdown')) return;
  const s = JSON.stringify(input);
  const now = performance.now();
  if (!force && s === lastSent) return;
  lastSent = s; lastSentAt = now;
  socket.volatile.emit('ctrl:input', input);
}

function resetInput() {
  pointers.clear();
  input.s = 0; input.b = 0; input.f = false; input.r = false; input.d = false;
  btns.forEach((b) => b.el.classList.remove('on'));
  if (joined) socket.emit('ctrl:input', input);
}

pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); recompute(); });
pad.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  recompute();
});
const up = (e: PointerEvent) => { pointers.delete(e.pointerId); recompute(); };
pad.addEventListener('pointerup', up);
pad.addEventListener('pointercancel', up);
pad.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') up(e); });

// pojistka: stav se pravidelně opakuje (kdyby se nějaký paket ztratil)
setInterval(() => { if (performance.now() - lastSentAt > 120) flush(true); }, 60);

// zákaz zoomu, výběru textu a kontextového menu při hraní
for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (document.body.classList.contains('playing')) e.preventDefault(); }, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') resetInput(); });

// kód místnosti z QR → rovnou se připoj, pokud už známe jméno
if (roomEl.value.length === 4 && nameEl.value) socket.once('connect', () => join(true));
