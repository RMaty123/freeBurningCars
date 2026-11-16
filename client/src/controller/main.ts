/**
 * Free Burning Cars – ovladač (telefon).
 * Levý palec zatáčí (tažením po ploše – analogově), pravý plyn / brzda / palba / raketa / nitro.
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
function show(id: 's-join' | 's-lobby' | 's-pad' | 's-results') {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  document.body.classList.toggle('playing', id === 's-pad');
  if (id !== 's-pad') resetInput();
}

function send(m: CtrlMsg) { socket.emit('ctrl:msg', m); }

function join(auto = false) {
  const name = (nameEl.value.trim() || 'HRÁČ').toUpperCase().slice(0, 12);
  const room = roomEl.value.trim().toUpperCase();
  if (room.length !== 4) { if (!auto) $('join-err').textContent = 'Zadej 4 písmena kódu místnosti z obrazovky.'; return; }
  store('fbc-name', name); store('fbc-room', room);
  $('join-err').textContent = auto ? '' : 'Připojuji…';
  socket.emit('ctrl:join', { room, pid, name }, (r: { ok: boolean; error?: string }) => {
    if (r.ok) {
      joined = true;
      $('offline').hidden = true;
      clearInterval(retryTimer); retryTimer = 0;
      $('join-err').textContent = '';
      if (document.querySelector('.screen.active')?.id === 's-join') show('s-lobby');
    } else if (!joined) {
      $('join-err').textContent = r.error ?? 'Nepodařilo se připojit.';
    }
  });
}

$('join').addEventListener('click', () => {
  // celá obrazovka (kde to prohlížeč dovolí) – víc místa na tlačítka
  try { void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {}); } catch { /* nevadí */ }
  try { void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch(() => {}); } catch { /* nevadí */ }
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
    $('car-name').textContent = m.carName;
    pips('st-speed', m.carStats.speed); pips('st-accel', m.carStats.accel); pips('st-handling', m.carStats.handling); pips('st-armor', m.carStats.armor);
    $('l-track').textContent = m.track;
    $('l-laps').textContent = String(m.laps);
    $('master-box').style.display = m.master && !m.waiting ? '' : 'none';
    const wait = $('l-wait');
    wait.style.display = m.master && !m.waiting ? 'none' : '';
    wait.textContent = m.waiting ? 'Závod právě běží – naskočíš do dalšího.' : 'Čekej, až první hráč odstartuje závod…';
    $('continue').style.display = m.master ? '' : 'none';
    $('r-wait').style.display = m.master ? 'none' : '';
    if (m.phase === 'lobby') show('s-lobby');
    else if (m.phase === 'results') show('s-results');
    else show('s-pad');
  } else if (m.type === 'hud') {
    $('p-pos').textContent = String(m.pos);
    $('p-total').textContent = '/' + m.total;
    $('p-lap').textContent = `${m.lap}/${m.laps}`;
    $('p-hp').style.transform = `scaleX(${m.hp})`;
    $('p-nitro').style.transform = `scaleX(${m.nitro})`;
    $('sec-label').textContent = m.sec === 'rocket' ? 'RAKETA' : 'MINA';
    $('sec-ammo').textContent = '×' + m.ammo;
    $('b-sec').classList.toggle('empty', m.ammo === 0);
    const ov = $('pad-overlay');
    ov.classList.toggle('show', m.dead || m.finished);
    ov.classList.toggle('fin', m.finished);
    ov.textContent = m.finished ? `CÍL · ${m.pos}. MÍSTO` : m.dead ? 'ZNIČEN!' : '';
  } else if (m.type === 'buzz') {
    try { navigator.vibrate?.(m.ms); } catch { /* iPhone vibrace neumí */ }
  } else if (m.type === 'kicked') {
    joined = false;
    show('s-join');
    $('join-err').textContent = m.reason;
  }
});

// ------------------------------------------------------------------ lobby tlačítka
const tap = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
tap('car-prev', () => send({ type: 'car', dir: -1 }));
tap('car-next', () => send({ type: 'car', dir: 1 }));
tap('trk-prev', () => send({ type: 'track', dir: -1 }));
tap('trk-next', () => send({ type: 'track', dir: 1 }));
tap('laps-dec', () => send({ type: 'laps', dir: -1 }));
tap('laps-inc', () => send({ type: 'laps', dir: 1 }));
tap('start', () => send({ type: 'start' }));
tap('continue', () => send({ type: 'continue' }));

// ------------------------------------------------------------------ řízení (multi-touch)
const input: InputState = { s: 0, t: 0, b: 0, f: false, r: false, n: false };
let lastSent = '';
let lastSentAt = 0;
const pointers = new Map<number, { x: number; y: number }>();
const pad = $('s-pad');
const steerEl = $('z-steer'), knob = $('knob');
const btns: { el: HTMLElement; key: 't' | 'b' | 'f' | 'r' | 'n' }[] = [
  { el: $('b-gas'), key: 't' }, { el: $('b-brake'), key: 'b' }, { el: $('b-fire'), key: 'f' }, { el: $('b-sec'), key: 'r' }, { el: $('b-nitro'), key: 'n' },
];

function inside(r: DOMRect, x: number, y: number, grow = 0): boolean {
  return x >= r.left - grow && x <= r.right + grow && y >= r.top - grow && y <= r.bottom + grow;
}

function recompute() {
  let steer = 0, steering = false;
  const sr = steerEl.getBoundingClientRect();
  const down: Record<string, boolean> = { t: false, b: false, f: false, r: false, n: false };
  const rects = btns.map((b) => b.el.getBoundingClientRect());
  for (const p of pointers.values()) {
    // levá polovina obrazovky = zatáčení: poloha palce vůči středu plochy
    if (p.x < sr.right + 8) {
      const half = sr.width * 0.36;
      let v = (p.x - (sr.left + sr.width / 2)) / half;
      v = Math.max(-1, Math.min(1, v));
      // malá mrtvá zóna + jemnější střed
      steer = Math.abs(v) < 0.06 ? 0 : Math.sign(v) * Math.pow(Math.abs(v), 1.25);
      steering = true;
      continue;
    }
    btns.forEach((b, i) => { if (inside(rects[i], p.x, p.y, 6)) down[b.key] = true; });
  }
  input.s = Math.round(steer * 100) / 100;
  input.t = down.t ? 1 : 0;
  input.b = down.b ? 1 : 0;
  input.f = down.f; input.r = down.r; input.n = down.n;
  btns.forEach((b) => b.el.classList.toggle('on', down[b.key]));
  steerEl.classList.toggle('active', steering);
  steerEl.classList.toggle('left', steer < -0.15);
  steerEl.classList.toggle('right', steer > 0.15);
  knob.style.transform = `translateX(${steer * sr.width * 0.36}px)`;
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
  input.s = 0; input.t = 0; input.b = 0; input.f = false; input.r = false; input.n = false;
  btns.forEach((b) => b.el.classList.remove('on'));
  knob.style.transform = '';
  steerEl.classList.remove('active', 'left', 'right');
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
