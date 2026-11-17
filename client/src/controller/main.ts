/**
 * Free Burning Cars – ovladač (telefon).
 * V závodě: plyn drží hra sama, tlačítka FIRE 1 (kulomet), DRIFT, FIRE 2 (raketa/mina), LEFT, BRAKE, RIGHT.
 * V menu (výběr tratě…): LEFT / SELECT / RIGHT / zpět – co se vybírá, říká obrazovka (HostMsg.menu).
 * Výběr auta i zbraně (FIRE 1): stejná obrazovka – lišta (zpět | jméno | potvrzení) a mřížka;
 * nabídku s náhledy posílá obrazovka. Ťuknutím vybereš, tlačítkem POTVRDIT potvrdíš.
 * Stav tlačítek se posílá na obrazovku přes Socket.IO.
 */
import { io } from 'socket.io-client';
import type { CtrlMsg, HostMsg, InputState, Phase, PickKind } from '../shared/protocol';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function store(key: string, value?: string): string {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key) ?? '';
  } catch { return value ?? ''; }
}

const pid = store('fbc-pid') || store('fbc-pid', Math.random().toString(36).slice(2) + Date.now().toString(36));
const params = new URLSearchParams(location.search);
const nameEl = $<HTMLInputElement>('name');
nameEl.value = store('fbc-name');
// kód místnosti se nikde neopisuje – buď přijde z QR kódu, nebo se vezme jediná běžící hra
let room = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

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
  store('fbc-name', name);
  $('join-err').textContent = auto ? '' : 'Připojuji…';
  if (!socket.connected) socket.connect(); // po "Odejít ze hry" je socket odpojený (zpráva počká ve frontě)
  socket.emit('ctrl:join', { room, pid, name }, (r: { ok: boolean; error?: string; room?: string }) => {
    if (r.ok) {
      room = r.room ?? room; // ať se po výpadku vracíme do té samé hry
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
nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { nameEl.blur(); join(); } });

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

/**
 * Zmenší písmo, dokud se text vejde do své škatulky (dlouhé názvy tratí se tak neuseknou).
 * Měří se až po vykreslení – ve skryté obrazovce mají prvky nulovou šířku.
 */
function fitText(el: HTMLElement) {
  requestAnimationFrame(() => {
    el.style.fontSize = '';
    if (!el.clientWidth) return;
    const base = parseFloat(getComputedStyle(el).fontSize);
    for (let i = 1; i <= 10 && el.scrollWidth > el.clientWidth + 1; i++) {
      el.style.fontSize = `${base * (1 - i * 0.07)}px`;
    }
  });
}

socket.on('host:msg', (m: HostMsg) => {
  if (m.type === 'state') {
    phase = m.phase;
    isMaster = m.master;
    document.documentElement.style.setProperty('--pc', m.color);
    $('l-name').textContent = m.name;
    $('l-slot').textContent = 'hráč ' + (m.slot + 1);
    $('l-laps').textContent = String(m.laps);
    $('l-bots').textContent = m.bots ? String(m.bots) : 'žádní';
    $('master-box').style.display = m.master && !m.waiting ? '' : 'none';
    const wait = $('l-wait');
    wait.style.display = m.master && !m.waiting ? 'none' : '';
    wait.textContent = m.waiting ? 'Závod právě běží – naskočíš do dalšího.' : 'Čekej, až první hráč vybere trať…';
    $('continue').style.display = m.master ? '' : 'none';
    $('r-wait').style.display = m.master ? 'none' : '';
    if (m.menu) {
      $('mn-title').textContent = m.menu.title;
      $('mn-label').textContent = m.menu.label;
      fitText($('mn-label'));
      // kdo nevybírá, vidí místo podrobností, kdo právě vybírá
      $('mn-sub').textContent = m.master ? m.menu.sub : `vybírá ${m.menu.by}`;
      $('s-menu').classList.toggle('locked', !m.master);
    }
    if (m.phase === 'lobby') show('s-lobby');
    else if (m.phase === 'track') show('s-menu');
    else if (m.phase === 'cars') { pickState('car', m.carIdx, m.ready, m.master, m.name); show('s-cars'); }
    else if (m.phase === 'guns') { pickState('gun', m.gunIdx, m.ready, m.master, m.name); show('s-cars'); }
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
    const chg = $('fire-chg');
    const lvl = m.beam > 0 ? m.beam : m.charge;
    chg.classList.toggle('on', lvl > 0.001);
    chg.classList.toggle('fire', m.beam > 0);
    chg.style.transform = `scaleX(${lvl})`;
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
tap('bots-dec', () => send({ type: 'bots', dir: -1 }));
tap('bots-inc', () => send({ type: 'bots', dir: 1 }));
tap('start', () => send({ type: 'select' }));
tap('continue', () => send({ type: 'select' }));

// ------------------------------------------------------------------ menu (výběr tratě…)
tap('mn-left', () => send({ type: 'nav', dir: -1 }));
tap('mn-right', () => send({ type: 'nav', dir: 1 }));
tap('mn-select', () => send({ type: 'select' }));
tap('mn-back', () => send({ type: 'back' }));

// ------------------------------------------------------------------ výběr auta a zbraně
// Obojí vypadá a funguje stejně, jen jiná mřížka a jiný nadpis.
type CatalogMsg = Extract<HostMsg, { type: 'catalog' }>;
const GRID: Record<PickKind, string> = { car: 'cs-grid', gun: 'gs-grid' };
const TITLE: Record<PickKind, string> = { car: 'VYBER AUTO', gun: 'VYBER ZBRAŇ · FIRE 1' };
const catalog: Record<PickKind, CatalogMsg[]> = { car: [], gun: [] };
const picked: Record<PickKind, number> = { car: 0, gun: 0 };
let pickKind: PickKind = 'car'; // co se zrovna vybírá
let pickReady = false;          // už potvrzeno?

/** Přišla (nebo se změnila) jedna položka nabídky → vytvoř / aktualizuj dlaždici. */
function catalogItem(m: CatalogMsg) {
  const list = catalog[m.kind];
  list[m.idx] = m;
  list.length = m.total;
  const grid = $(GRID[m.kind]);
  let tile = grid.querySelector<HTMLElement>(`[data-i="${m.idx}"]`);
  if (!tile) {
    tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.i = String(m.idx);
    tile.innerHTML = '<img alt="" /><span></span>';
    tile.addEventListener('click', () => {
      if (pickReady || pickKind !== m.kind) return;
      picked[m.kind] = m.idx; // hned zvýrazni, obrazovka to potvrdí stavem
      renderPick();
      send({ type: 'pick', idx: m.idx });
    });
    // dlaždice drž v pořadí podle indexu, i kdyby zprávy přišly napřeskáčku
    const after = [...grid.children].find((c) => Number((c as HTMLElement).dataset.i) > m.idx);
    grid.insertBefore(tile, after ?? null);
  }
  (tile.querySelector('img') as HTMLImageElement).src = m.img;
  (tile.querySelector('span') as HTMLElement).textContent = m.name;
  for (const c of [...grid.children]) if (Number((c as HTMLElement).dataset.i) >= m.total) c.remove();
  grid.classList.toggle('few', m.total <= 6);
  renderPick();
}

function pickState(kind: PickKind, idx: number, ready: boolean, master: boolean, name: string) {
  pickKind = kind;
  picked[kind] = idx;
  pickReady = ready;
  $('cs-player').textContent = name;
  $('cs-what').textContent = TITLE[kind];
  // o krok zpět může poprosit jen první hráč
  $('cs-back').style.visibility = master ? 'visible' : 'hidden';
  renderPick();
}

function renderPick() {
  const kind = pickKind;
  for (const k of ['car', 'gun'] as PickKind[]) $(GRID[k]).hidden = k !== kind;
  const idx = picked[kind];
  for (const t of $(GRID[kind]).children) t.classList.toggle('on', Number((t as HTMLElement).dataset.i) === idx);
  // po potvrzení se nabídka zamkne: ostatní dlaždice zešednou a místo POTVRDIT je ZMĚNIT
  $('s-cars').classList.toggle('locked', pickReady);
  $('cs-confirm').hidden = pickReady;
  $('cs-change').hidden = !pickReady;
  const item = catalog[kind][idx];
  $('cs-carname').textContent = item ? (pickReady ? '✔ ' : '') + item.name : '—';
  // na tlačítku FIRE 1 ať je vidět, s čím se jede
  const gun = catalog.gun[picked.gun];
  if (gun) $('fire-name').textContent = gun.name.toLowerCase();
}

tap('cs-confirm', () => { pickReady = true; renderPick(); send({ type: 'ready', on: true }); });
tap('cs-change', () => { pickReady = false; renderPick(); send({ type: 'ready', on: false }); });
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

// jméno už známe (z minula) → připoj se rovnou, ať se nikde neťuká
if (nameEl.value) socket.once('connect', () => join(true));
