/**
 * Free Burning Cars – ovladač (telefon).
 * V závodě: plyn drží hra sama, tlačítka FIRE 1 (kulomet), DRIFT, FIRE 2 (raketa), LEFT, BRAKE, RIGHT.
 * Druhý typ hry ("náklon"): LEFT/RIGHT zmizí, zatáčí se nakláněním telefonu jako volantem
 * (viz blok "zatáčení náklonem" níž) a pad má jen FIRE 1 | FIRE 2 nahoře a DRIFT | BRAKE dole.
 * V menu (výběr tratě…): LEFT / SELECT / RIGHT / zpět – co se vybírá, říká obrazovka (HostMsg.menu).
 * Výběr auta i zbraně (FIRE 1): stejná obrazovka – lišta (zpět | jméno | potvrzení) a mřížka;
 * nabídku s náhledy posílá obrazovka. Ťuknutím vybereš, tlačítkem POTVRDIT potvrdíš.
 * Stav tlačítek se posílá na obrazovku přes Socket.IO.
 */
import { io } from 'socket.io-client';
import { packInput, type CtrlMsg, type HostMsg, type InputState, type Phase, type PickKind } from '../shared/protocol';
import { keepScreenAwake } from '../shared/wakeLock';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function store(key: string, value?: string): string {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key) ?? '';
  } catch { return value ?? ''; }
}

const pid = store('fbc-pid') || store('fbc-pid', Math.random().toString(36).slice(2) + Date.now().toString(36));
// ať telefon během závodu nezhasne obrazovku
keepScreenAwake();

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
  // při vstupu do závodu si zapamatuj, jak hráč drží telefon (a zkus zapnout senzor, kdyby čekal na dotyk)
  if (id === 's-pad') { void tiltEnable(false); tiltZeroNow(); }
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
    setTiltMode(m.tilt);
    $('t-name').textContent = m.name;
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
    $('sec-ammo').textContent = 'raketa ×' + m.ammo;
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
const vibe = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* iPhone vibrace neumí */ } };
tap('laps-dec', () => send({ type: 'laps', dir: -1 }));
tap('laps-inc', () => send({ type: 'laps', dir: 1 }));
tap('bots-dec', () => send({ type: 'bots', dir: -1 }));
tap('bots-inc', () => send({ type: 'bots', dir: 1 }));
tap('start', () => send({ type: 'select' }));
tap('tilt-btn', () => send({ type: 'tilt' }));
tap('tilt-allow', () => { tiltDenied = false; void tiltEnable(true); });
tap('t-zero', () => { tiltZeroNow(); vibe(30); });
tap('t-flip', () => {
  tiltFlip = -tiltFlip;
  store('fbc-tilt-flip', tiltFlip < 0 ? '1' : '0');
  tiltZeroNow();
  vibe(30);
});
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

// ------------------------------------------------------------------ zatáčení náklonem (gyroskop)
/*
 * Jak to funguje:
 *  1) senzor  – 'deviceorientation' dá beta/gamma; podle natočení obrazovky (screen.orientation.angle)
 *               z nich vybereme úhel, o který je telefon natočený kolem osy pohledu (jako volant).
 *  2) nula    – při zapnutí (a tlačítkem SROVNAT nebo na startu závodu) si zapamatujeme, jak hráč drží
 *               telefon; počítá se jen odchylka od téhle nuly, takže je jedno, jestli leží nebo stojí.
 *  3) křivka  – do TILT_DEAD° se nezatáčí vůbec (klid v rukou), TILT_FULL° je plný rejd a mezi tím
 *               mocnina TILT_CURVE, aby byl střed jemný a kraje svižné.
 *  4) hlazení – adaptivní filtr (á la "1€"): když telefon leží v klidu, hladí silně (klid v ruce),
 *               jakmile s ním hneš, se otevře a skoro nezpožďuje. Pevný filtr by buď šuměl, nebo zpožďoval.
 *  5) odesílání – počítá se rovnou v obsluze senzoru (žádné čekání na časovač), hodnota se zaokrouhlí
 *               na 0,02 a pošle jen při změně – jeden malý paket, nejvýš tolikrát, kolikrát tiká senzor.
 *  6) pojistka – když do 1,8 s nepřijde ze senzoru nic (nepovolený přístup, chybí HTTPS, starý telefon),
 *               ovladač se sám vrátí k tlačítkům a napíše proč.
 */
const TILT_DEAD = 3;        // ° kolem nuly, kde se ještě nezatáčí
const TILT_FULL = 26;       // ° = plný rejd
const TILT_CURVE = 1.35;    // > 1 = jemnější střed
const TILT_STEP = 1 / 50;   // na kolik se zaokrouhluje posílaná hodnota
const TILT_CUT = 2.5;       // Hz – mez filtru v klidu (silnější hlazení)
const TILT_BETA = 0.06;     // o kolik se filtr otevře na každý °/s pohybu
const TILT_DCUT = 1.0;      // Hz – hlazení odhadu rychlosti

let tiltMode = false;       // typ hry zvolený na obrazovce
let tiltLive = false;       // senzor opravdu posílá data
let tiltListening = false;
let tiltRaw = 0;            // poslední úhel ze senzoru (°)
let tiltZero = 0;           // srovnaná nula
let tiltVal = 0;            // vyhlazený výstup -1…1
let tiltSeen = 0;           // čas posledního vzorku
let oeAng = 0, oeVel = 0, oeT = 0, oeReady = false; // stav adaptivního filtru
let tiltFlip = store('fbc-tilt-flip') === '1' ? -1 : 1;
let tiltDenied = false;      // povolení senzoru zamítnuto – nezkoušíme to pak při každém ťuknutí

type OrientEvt = DeviceOrientationEvent;
type PermDOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Úhel natočení telefonu kolem osy pohledu, přepočtený podle toho, jak je otočená obrazovka. */
function tiltAngle(e: OrientEvt): number | null {
  if (e.beta == null || e.gamma == null) return null;
  const a = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
  if (a === 90) return e.beta;
  if (a === 270 || a === -90) return -e.beta;
  if (a === 180) return -e.gamma;
  return e.gamma;
}

/** Adaptivní filtr: v klidu hladí, při pohybu pouští signál skoro bez zpoždění. */
function tiltFilter(raw: number, dt: number): number {
  const a = (cut: number) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  if (!oeReady) { oeReady = true; oeAng = raw; oeVel = 0; return raw; }
  const vel = (raw - oeAng) / dt;
  oeVel += a(TILT_DCUT) * (vel - oeVel);
  oeAng += a(TILT_CUT + TILT_BETA * Math.abs(oeVel)) * (raw - oeAng);
  return oeAng;
}

function onOrient(e: OrientEvt) {
  const ang = tiltAngle(e);
  if (ang == null) return;
  const now = performance.now();
  if (!tiltSeen) { tiltZero = ang; oeReady = false; tiltNote('', ''); }
  const dt = Math.min(0.1, Math.max(0.004, (now - oeT) / 1000 || 0.016));
  oeT = now;
  tiltSeen = now;
  tiltRaw = ang;
  if (!tiltLive) { tiltLive = true; applyPad(); tiltNote('náklon zapnutý ✓', 'ok'); }
  // hodnota se počítá i posílá hned tady – žádný časovač mezi senzorem a sítí
  const d = (tiltFilter(ang, dt) - tiltZero) * tiltFlip;
  const mag = Math.min(1, Math.max(0, Math.abs(d) - TILT_DEAD) / (TILT_FULL - TILT_DEAD));
  tiltVal = Math.sign(d) * Math.pow(mag, TILT_CURVE);
  const q = Math.round(tiltVal / TILT_STEP) * TILT_STEP;
  if (q !== input.s) {
    input.s = q;
    flush(false);
    $('t-bubble').style.transform = `translateX(${(q * 230).toFixed(1)}%)`;
  }
}

function tiltNote(text: string, cls: 'ok' | 'bad' | '') {
  const l = $('tilt-note'), p = $('t-note');
  l.textContent = text; l.className = 'wait ' + cls;
  p.textContent = cls === 'bad' ? text : '';
  $('tilt-allow').hidden = tiltLive; // když senzor jede, není co povolovat
}

function tiltFail(why: string) {
  tiltLive = false;
  tiltListening = false;
  window.removeEventListener('deviceorientation', onOrient);
  input.s = 0;
  tiltNote(why + ' Jedeš na tlačítka.', 'bad');
  applyPad();
}

/** Zapne poslouchání senzoru. Na iOS to jde jen jako reakce na dotyk, proto fromTap. */
async function tiltEnable(fromTap: boolean) {
  if (!tiltMode || tiltListening) return;
  const DOE = window.DeviceOrientationEvent as PermDOE | undefined;
  if (!DOE) { tiltFail('Telefon neumí číst náklon.'); return; }
  if (typeof DOE.requestPermission === 'function') {
    // prohlížeč se musí zeptat na povolení a smí to jen po dotyku
    if (!fromTap) { tiltNote('Ťukni na ZAPNOUT NÁKLON – telefon se zeptá na povolení.', ''); return; }
    try {
      if (await DOE.requestPermission() !== 'granted') { tiltDenied = true; tiltFail('Přístup k pohybovým senzorům je zakázaný.'); return; }
    } catch { tiltFail('Přístup k senzorům se nepodařilo vyžádat.'); return; }
  }
  tiltListening = true;
  tiltSeen = 0;
  window.addEventListener('deviceorientation', onOrient);
  tiltNote('zapínám náklon…', '');
  setTimeout(() => {
    if (tiltListening && !tiltSeen) {
      tiltFail(window.isSecureContext ? 'Telefon náklon neposílá.' : 'Prohlížeč pustí náklon jen přes HTTPS.');
    }
  }, 1800);
}

/** Zapamatuje si, jak hráč zrovna drží telefon – od téhle polohy se počítá zatáčení. */
function tiltZeroNow() {
  if (!tiltLive) return;
  tiltZero = tiltRaw;
  tiltVal = 0;
  oeReady = false; // filtr začne od nové polohy, ať se nula nepřitahuje ze starého stavu
}

function setTiltMode(on: boolean) {
  $('tilt-mode').textContent = on ? 'NÁKLON' : 'TLAČÍTKA';
  $('tilt-btn').hidden = !isMaster;
  $('tilt-box').hidden = !on;
  if (on === tiltMode) { if (on) void tiltEnable(false); return; }
  tiltMode = on;
  if (on) void tiltEnable(false);
  else {
    tiltListening = false;
    tiltLive = false;
    window.removeEventListener('deviceorientation', onOrient);
    tiltNote('', '');
  }
  applyPad();
}

/** Pad má dvě podoby: klasickou (6 tlačítek) a náklonovou (4 tlačítka + ukazatel). */
function applyPad() {
  pad.classList.toggle('tilt', tiltOn());
  resetInput();
}

/** Jede se na náklon? (Jen když to obrazovka chce a senzor opravdu posílá data.) */
function tiltOn(): boolean {
  return tiltMode && tiltLive;
}

// hlídač: kdyby senzor zmlkl (vypnutá obrazovka, odepřené povolení), vrať se k tlačítkům
setInterval(() => {
  if (tiltOn() && performance.now() - tiltSeen > 1500) tiltFail('Senzor přestal posílat náklon.');
}, 500);

// ------------------------------------------------------------------ řízení (multi-touch)
type Key = 'f' | 'd' | 'r' | 'left' | 'b' | 'right';
const input: InputState = { s: 0, b: 0, f: false, r: false, d: false };
let lastSent = -1;
let lastSentAt = 0;
const pointers = new Map<number, { x: number; y: number }>();
const pad = $('pad');
// pořadí = mřížka 3 × 2: nahoře FIRE 1 | DRIFT | FIRE 2, dole LEFT | BRAKE | RIGHT
const btns: { el: HTMLElement; key: Key }[] = [
  { el: $('b-fire'), key: 'f' }, { el: $('b-drift'), key: 'd' }, { el: $('b-sec'), key: 'r' },
  { el: $('b-left'), key: 'left' }, { el: $('b-brake'), key: 'b' }, { el: $('b-right'), key: 'right' },
];

/** V náklonovém padu jsou čtyři kvadranty: FIRE 1 | FIRE 2 nahoře, DRIFT | BRAKE dole. */
const TILT_KEYS: Key[] = ['f', 'r', 'd', 'b'];

function recompute() {
  const down: Record<Key, boolean> = { f: false, d: false, r: false, left: false, b: false, right: false };
  const box = pad.getBoundingClientRect();
  if (tiltOn()) {
    // hranice vede středem mezery mezi řadami, takže nikde není hluché místo
    const fr = btns[0].el.getBoundingClientRect(), dr = btns[1].el.getBoundingClientRect();
    const rowY = (fr.bottom + dr.top) / 2, colX = box.left + box.width / 2;
    for (const p of pointers.values()) {
      if (p.y < box.top) continue;
      down[TILT_KEYS[(p.y < rowY ? 0 : 2) + (p.x < colX ? 0 : 1)]] = true;
    }
    // input.s drží náklon, tlačítka do zatáčení nemluví
  } else {
    const rects = btns.map((b) => b.el.getBoundingClientRect());
    // hranice sloupců a řádků leží uprostřed mezer, takže mezi tlačítky není hluché místo
    const colA = (rects[0].right + rects[1].left) / 2, colB = (rects[1].right + rects[2].left) / 2;
    const rowY = (rects[1].bottom + rects[4].top) / 2;
    for (const p of pointers.values()) {
      if (p.y < box.top) continue;
      const col = p.x < colA ? 0 : p.x < colB ? 1 : 2;
      const row = p.y < rowY ? 0 : 1;
      down[btns[row * 3 + col].key] = true;
    }
    input.s = (down.right ? 1 : 0) - (down.left ? 1 : 0);
  }
  input.b = down.b ? 1 : 0;
  input.f = down.f; input.r = down.r; input.d = down.d;
  btns.forEach((b) => b.el.classList.toggle('on', down[b.key]));
  flush(false);
}

function flush(force: boolean) {
  if (!joined || (phase !== 'race' && phase !== 'countdown')) return;
  // celý stav ovladače je jedno číslo – nic se nestringifikuje a paket je pár bajtů
  const n = packInput(input);
  if (!force && n === lastSent) return;
  lastSent = n;
  lastSentAt = performance.now();
  socket.volatile.emit('i', n);
}

function resetInput() {
  pointers.clear();
  input.s = 0; input.b = 0; input.f = false; input.r = false; input.d = false;
  tiltVal = 0;
  btns.forEach((b) => b.el.classList.remove('on'));
  lastSent = packInput(input);
  if (joined) socket.emit('i', lastSent); // puštěná tlačítka se musí doručit vždycky
}

pad.addEventListener('pointerdown', (e) => {
  // SROVNAT / ⇄ uprostřed jsou normální tlačítka, ne část volantu
  if ((e.target as HTMLElement).closest('.tilt-ui')) return;
  e.preventDefault();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  recompute();
});
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

// iOS pustí senzory jen po ťuknutí – zkusíme to při prvním dotyku kdekoli
document.addEventListener('pointerdown', () => { if (tiltMode && !tiltListening && !tiltDenied) void tiltEnable(true); }, { capture: true });

// pojistka: stav se pravidelně opakuje (kdyby se nějaký paket ztratil)
setInterval(() => { if (performance.now() - lastSentAt > 120) flush(true); }, 60);

// zákaz zoomu, výběru textu a kontextového menu při hraní
for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (document.body.classList.contains('playing')) e.preventDefault(); }, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') resetInput(); });

// jméno už známe (z minula) → připoj se rovnou, ať se nikde neťuká
if (nameEl.value) socket.once('connect', () => join(true));
