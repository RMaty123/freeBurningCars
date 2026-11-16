/**
 * Free Burning Cars – obrazovka (PC / TV).
 * Tady běží celá hra: simulace, grafika, zvuk. Telefony jen posílají vstupy přes server.
 *
 * Fáze: lobby (na pozadí jede ukázka AI) → odpočet → závod → výsledky → lobby…
 */
import { io } from 'socket.io-client';
import { AI_COLORS, AI_NAMES, CAR_TYPES, PLAYER_COLORS, hexCss, statBars } from '../game/cars';
import { CarEntry, Sim, SimEvent } from '../game/sim';
import { TRACKS, Track, buildTrack } from '../game/track';
import { GameView } from '../render/gameView';
import { CtrlMsg, EMPTY_INPUT, HostMsg, InputState, Phase } from '../shared/protocol';
import { GameAudio } from './audio';
import { Hud } from './hud';

const TOTAL_CARS = 6;
const MAX_PLAYERS = 4;
const KBD = 'keyboard';
const POINTS = [10, 8, 6, 5, 4, 3];
const DIFFS = [
  { name: 'lehká', skill: 0.86 },
  { name: 'střední', skill: 0.93 },
  { name: 'těžká', skill: 1.0 },
];

interface Player {
  pid: string;
  name: string;
  slot: number;
  carIdx: number;
  connected: boolean;
  input: InputState;
  points: number;
  /** připojil se během závodu – pojede až příští */
  waiting: boolean;
  lastBuzz: number;
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// ------------------------------------------------------------------ stav
const view = new GameView($('game') as HTMLCanvasElement);
const hud = new Hud();
const audio = new GameAudio();
const players = new Map<string, Player>();
const tracks = new Map<string, Track>();

let phase: Phase = 'lobby';
let trackIdx = 0;
let laps = 3;
let diff = 1;
let sim: Sim | null = null;
let room = '';
let resultsT = 0;
let hudSendT = 0;
const keys = new Set<string>();

function getTrack(i: number): Track {
  const def = TRACKS[i];
  let t = tracks.get(def.id);
  if (!t) { t = buildTrack(def); tracks.set(def.id, t); }
  return t;
}

function toast(text: string, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => el.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ síť
const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  const wanted = sessionStorage.getItem('fbc-room') ?? '';
  socket.emit('host:create', { room: wanted }, (r: { room: string; urls: string[]; qr: string }) => {
    room = r.room;
    sessionStorage.setItem('fbc-room', room);
    $('room-code').textContent = room;
    ($('qr') as HTMLImageElement).src = r.qr;
    const short = r.urls[0].replace(/^http:\/\//, '').replace(/\?room=.*/, '');
    $('join-url').textContent = short;
    const warn = $('net-warn');
    if (r.urls[0].includes('localhost')) {
      warn.hidden = false;
      warn.textContent = 'PC není připojené k síti – telefon se nepřipojí. Připoj PC k Wi-Fi a restartuj server.';
    } else if (r.urls.length > 1) {
      warn.hidden = false;
      warn.textContent = 'Nejde to? Zkus i: ' + r.urls.slice(1, 3).map((u) => u.replace(/^http:\/\//, '').replace(/\/controller.*/, '')).join(' , ');
    } else warn.hidden = true;
  });
});

socket.on('player:join', ({ pid, name }: { pid: string; name: string }) => {
  let p = players.get(pid);
  if (p) {
    p.connected = true;
    p.name = name;
  } else {
    const slot = freeSlot();
    if (slot < 0) {
      socket.emit('host:to', { pid, m: { type: 'kicked', reason: 'Hra je plná (max 4 hráči).' } satisfies HostMsg });
      return;
    }
    p = { pid, name, slot, carIdx: slot % CAR_TYPES.length, connected: true, input: { ...EMPTY_INPUT }, points: 0, waiting: phase !== 'lobby', lastBuzz: 0 };
    players.set(pid, p);
    audio.ui();
  }
  // návrat do rozjetého závodu: auto si zase převezme člověk
  const car = sim?.carByPid(pid);
  if (car && phase !== 'lobby') { car.human = true; p.waiting = false; }
  refreshLobby();
  pushStates();
});

socket.on('player:leave', ({ pid }: { pid: string }) => {
  const p = players.get(pid);
  if (!p) return;
  p.connected = false;
  p.input = { ...EMPTY_INPUT };
  const car = sim?.carByPid(pid);
  if (phase === 'lobby' || !car) players.delete(pid);
  else car.human = false; // než se vrátí, řídí za něj AI
  refreshLobby();
  pushStates();
});

socket.on('player:input', ({ pid, d }: { pid: string; d: InputState }) => {
  const p = players.get(pid);
  if (p && d) p.input = d;
});

socket.on('player:msg', ({ pid, m }: { pid: string; m: CtrlMsg }) => {
  const p = players.get(pid);
  if (!p || !m) return;
  handleCommand(p, m);
});

function freeSlot(): number {
  for (let s = 0; s < MAX_PLAYERS; s++) if (![...players.values()].some((p) => p.slot === s)) return s;
  return -1;
}

function master(): Player | undefined {
  return [...players.values()].filter((p) => p.connected).sort((a, b) => a.slot - b.slot)[0];
}

function handleCommand(p: Player, m: CtrlMsg) {
  const isMaster = master()?.pid === p.pid;
  if (m.type === 'car' && phase === 'lobby') {
    p.carIdx = (p.carIdx + m.dir + CAR_TYPES.length) % CAR_TYPES.length;
    audio.ui();
  } else if (m.type === 'track' && phase === 'lobby' && isMaster) {
    changeTrack(m.dir);
  } else if (m.type === 'laps' && phase === 'lobby' && isMaster) {
    laps = Math.max(1, Math.min(9, laps + m.dir));
    audio.ui();
  } else if (m.type === 'start' && phase === 'lobby' && isMaster) {
    startRace();
    return;
  } else if (m.type === 'continue' && phase === 'results' && isMaster) {
    toLobby(true);
    return;
  }
  refreshLobby();
  pushStates();
}

function stateFor(p: Player): HostMsg {
  const car = CAR_TYPES[p.carIdx];
  return {
    type: 'state',
    phase: p.waiting && phase !== 'lobby' ? 'lobby' : phase,
    slot: p.slot,
    color: hexCss(PLAYER_COLORS[p.slot]),
    name: p.name,
    carName: car.name,
    carIdx: p.carIdx,
    carStats: statBars(car),
    master: master()?.pid === p.pid,
    waiting: p.waiting && phase !== 'lobby',
    track: TRACKS[trackIdx].name,
    laps,
  };
}

function pushStates() {
  for (const p of players.values()) {
    if (p.pid === KBD || !p.connected) continue;
    socket.emit('host:to', { pid: p.pid, m: stateFor(p) });
  }
}

function buzz(p: Player, ms: number) {
  if (p.pid === KBD || !p.connected) return;
  const now = performance.now();
  if (now - p.lastBuzz < 180) return;
  p.lastBuzz = now;
  socket.emit('host:to', { pid: p.pid, m: { type: 'buzz', ms } satisfies HostMsg });
}

// ------------------------------------------------------------------ lobby
function refreshLobby() {
  const list = $('slots');
  const sorted = [...players.values()].sort((a, b) => a.slot - b.slot);
  const m = master();
  let html = '';
  for (let s = 0; s < MAX_PLAYERS; s++) {
    const p = sorted.find((x) => x.slot === s);
    if (!p) {
      html += `<li class="empty" style="--pc:${hexCss(PLAYER_COLORS[s])}"><div class="badge">${s + 1}</div><div class="who"><b>volné místo</b><small>naskenuj QR kód</small></div><div class="tagr"></div></li>`;
      continue;
    }
    const car = CAR_TYPES[p.carIdx];
    html += `<li style="--pc:${hexCss(PLAYER_COLORS[s])}">
      <div class="badge">${s + 1}</div>
      <div class="who"><b>${esc(p.name)}</b><small>${car.name} · ${esc(car.tagline)}</small></div>
      <div class="tagr">${m?.pid === p.pid ? '<span class="master">★ startuje závod</span><br>' : ''}${p.pid === KBD ? 'klávesnice' : p.connected ? 'telefon' : 'odpojen'}${p.points ? `<br>${p.points} b.` : ''}</div>
    </li>`;
  }
  list.innerHTML = html;
  $('track-name').textContent = TRACKS[trackIdx].name;
  $('laps').textContent = String(laps);
  $('ai-level').textContent = DIFFS[diff].name;
  const humans = sorted.length;
  $('ai-count').textContent = `${Math.max(0, TOTAL_CARS - humans)} AI`;
  const sh = $('start-hint');
  if (!humans) { sh.textContent = 'Čekám na hráče…'; sh.classList.remove('ready'); }
  else {
    sh.textContent = m?.pid === KBD ? 'ENTER = START' : `${m?.name ?? 'Hráč 1'}: zmáčkni START`;
    sh.classList.add('ready');
  }
}

function changeTrack(dir: number) {
  trackIdx = (trackIdx + dir + TRACKS.length) % TRACKS.length;
  audio.ui();
  startAttract();
}

function aiEntries(n: number, startAt = 0): CarEntry[] {
  const out: CarEntry[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i + startAt) % AI_NAMES.length;
    const typeIdx = (i + startAt + 1) % CAR_TYPES.length;
    out.push({ name: AI_NAMES[k], color: AI_COLORS[k], typeIdx, stats: CAR_TYPES[typeIdx], human: false, pid: null });
  }
  return out;
}

/** Ukázková jízda AI na pozadí menu. */
function startAttract() {
  const track = getTrack(trackIdx);
  view.setTrack(track);
  sim = new Sim(track, aiEntries(TOTAL_CARS), { laps: 999, attract: true, aiSkill: 0.95 });
  // ať se v menu hned něco děje
  for (let i = 0; i < 240; i++) sim.step(1 / 30);
  sim.events.length = 0;
  view.setSim(sim, []);
  hud.clear();
  hud.show(false);
  audio.setEngines([]);
}

function toLobby(nextTrack: boolean) {
  phase = 'lobby';
  $('results').hidden = true;
  $('lobby').hidden = false;
  $('countdown').innerHTML = '';
  for (const [pid, p] of players) {
    if (!p.connected) players.delete(pid);
    else p.waiting = false;
  }
  if (nextTrack) trackIdx = (trackIdx + 1) % TRACKS.length;
  startAttract();
  refreshLobby();
  pushStates();
}

// ------------------------------------------------------------------ závod
function startRace() {
  const humans = [...players.values()].filter((p) => p.connected).sort((a, b) => a.slot - b.slot);
  if (!humans.length) return;
  const track = getTrack(trackIdx);
  const entries: CarEntry[] = humans.map((p) => ({
    name: p.name, color: PLAYER_COLORS[p.slot], typeIdx: p.carIdx, stats: CAR_TYPES[p.carIdx], human: true, pid: p.pid,
  }));
  entries.push(...aiEntries(TOTAL_CARS - humans.length, Math.floor(Math.random() * 6)));
  sim = new Sim(track, entries, { laps, aiSkill: DIFFS[diff].skill });
  for (const p of humans) { p.waiting = false; p.input = { ...EMPTY_INPUT }; }
  const ids = humans.map((p) => sim!.carByPid(p.pid)!.id);
  view.setSim(sim, ids);
  hud.layout(view.getRects(), sim);
  hud.show(true);
  audio.setEngines(ids);
  phase = 'countdown';
  $('lobby').hidden = true;
  $('results').hidden = true;
  pushStates();
}

function showCount(text: string, go = false) {
  $('countdown').innerHTML = `<span class="${go ? 'go' : ''}">${text}</span>`;
}

function finishRace() {
  if (!sim) return;
  phase = 'results';
  resultsT = 30;
  audio.setEngines([]);
  hud.show(false);
  const rows = [...sim.cars].sort((a, b) => a.place - b.place);
  let html = '';
  rows.forEach((c, i) => {
    const pts = (POINTS[c.place - 1] ?? 0) + c.kills;
    const p = c.pid ? players.get(c.pid) : undefined;
    if (p) p.points += pts;
    const best = c.bestLap ? c.bestLap.toFixed(2).replace('.', ',') + ' s' : '—';
    html += `<tr class="${c.pid ? 'human' : ''}" style="--pc:${hexCss(c.color)};animation-delay:${i * 0.08}s">
      <td>${c.place}.</td><td class="name">${esc(c.name)}${c.pid ? '' : '<small>AI</small>'}</td><td>${c.stats.name}</td>
      <td>${best}</td><td>${c.kills}×</td><td>+${pts}${p ? `<small>celkem ${p.points}</small>` : ''}</td></tr>`;
  });
  $('results-body').innerHTML = html;
  $('results-track').textContent = `${sim.track.def.name} · ${sim.laps} ${sim.laps === 1 ? 'kolo' : sim.laps < 5 ? 'kola' : 'kol'}`;
  $('results').hidden = false;
  audio.finish();
  pushStates();
}

function abortRace() {
  if (phase === 'lobby') return;
  toast('Závod ukončen');
  toLobby(false);
}

/** Hlasitost podle vzdálenosti k nejbližšímu lidskému hráči. */
function volAt(x: number, z: number): number {
  if (!sim || phase === 'lobby') return 0.12;
  let best = Infinity;
  for (const c of sim.cars) if (c.pid) best = Math.min(best, Math.hypot(c.x - x, c.z - z));
  return 1 / (1 + (best / 26) ** 2);
}

function onEvents(s: Sim, events: SimEvent[]) {
  const racing = phase !== 'lobby';
  for (const e of events) {
    switch (e.t) {
      case 'count': showCount(String(e.n)); audio.beep(false); break;
      case 'go':
        showCount('GO!', true); audio.beep(true);
        phase = 'race';
        pushStates();
        break;
      case 'shot': audio.shot(volAt(e.x, e.z)); break;
      case 'hit': {
        audio.hit(volAt(e.x, e.z));
        const p = playerOf(s, e.car);
        if (p) buzz(p, 25);
        break;
      }
      case 'boom': audio.boom(volAt(e.x, e.z), e.size); break;
      case 'crash': {
        audio.crash(volAt(e.x, e.z) * Math.min(1, e.force / 14));
        for (const id of [e.a, e.b]) { const p = playerOf(s, id); if (p) buzz(p, 60); }
        break;
      }
      case 'wall': {
        audio.crash(volAt(e.x, e.z) * Math.min(1, e.force / 16));
        const p = playerOf(s, e.car);
        if (p && e.force > 5) buzz(p, 50);
        break;
      }
      case 'launch': {
        const c = s.cars[e.car];
        if (e.kind === 'rocket') audio.launch(volAt(c.x, c.z)); else audio.mineDrop(volAt(c.x, c.z));
        break;
      }
      case 'pickup': {
        audio.pickup(volAt(e.x, e.z));
        if (racing && s.cars[e.car].pid) {
          const label = { repair: '+ OPRAVA', rocket: '+ RAKETY', mine: '+ MINY', nitro: 'BOOST ×1,7' }[e.kind];
          hud.message(e.car, label, e.kind === 'nitro' ? 'gold small' : 'good small', 1.1);
        }
        break;
      }
      case 'destroyed': {
        if (!racing) break;
        const victim = s.cars[e.car], killer = e.by >= 0 ? s.cars[e.by] : null;
        hud.message(e.car, 'ZNIČEN!', 'bad', 2.2);
        const vp = playerOf(s, e.car);
        if (vp) buzz(vp, 400);
        if (killer) {
          hud.message(killer.id, `ZNIČIL JSI ${victim.name}`, 'gold small', 2);
          hud.feed(`<span style="color:${hexCss(killer.color)}">${esc(killer.name)}</span><span class="x">✖</span><span style="color:${hexCss(victim.color)}">${esc(victim.name)}</span>`);
        } else {
          hud.feed(`<span style="color:${hexCss(victim.color)}">${esc(victim.name)}</span><span class="x">✖</span>svodidla`);
        }
        break;
      }
      case 'respawn': { const c = s.cars[e.car]; audio.respawn(volAt(c.x, c.z)); break; }
      case 'lap':
        if (racing && s.cars[e.car].pid) {
          audio.lap();
          const last = e.lap === s.laps;
          hud.message(e.car, last ? 'POSLEDNÍ KOLO!' : `KOLO ${e.lap}/${s.laps}`, last ? 'gold' : '', 2);
        }
        break;
      case 'finish':
        if (racing) {
          const c = s.cars[e.car];
          if (c.pid) { audio.finish(); hud.message(e.car, `CÍL · ${e.place}. MÍSTO`, 'gold', 6); }
          hud.feed(`🏁 <span style="color:${hexCss(c.color)}">${esc(c.name)}</span> – ${e.place}. místo`);
        }
        break;
    }
  }
}

function playerOf(s: Sim, carId: number): Player | undefined {
  const pid = s.cars[carId]?.pid;
  return pid ? players.get(pid) : undefined;
}

// ------------------------------------------------------------------ klávesnice
function kbdInput(): InputState {
  const k = (...c: string[]) => c.some((x) => keys.has(x));
  return {
    s: (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0),
    b: k('ArrowDown', 'KeyS') ? 1 : 0,
    f: k('Space'),
    r: k('KeyF', 'KeyE'),
    d: k('ShiftLeft', 'ShiftRight'),
  };
}

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  const kp = players.get(KBD);

  if (e.code === 'KeyG') { view.setQuality(view.quality === 'high' ? 'low' : 'high'); autoQuality = false; toast('Grafika: ' + (view.quality === 'high' ? 'vysoká (stíny)' : 'nízká (rychlejší)')); }
  if (e.code === 'KeyM') toast(audio.toggleMute() ? 'Zvuk vypnutý' : 'Zvuk zapnutý');
  if (e.code === 'Escape') {
    if (phase !== 'lobby') abortRace();
    else if (kp) { players.delete(KBD); refreshLobby(); pushStates(); }
  }

  if (phase === 'lobby') {
    if (e.code === 'Enter') {
      // první ENTER přidá hráče na klávesnici, další odstartuje závod
      if (!kp) addKeyboardPlayer();
      else startRace();
    }
    if (e.code === 'KeyT') changeTrack(1), refreshLobby(), pushStates();
    if (e.code === 'KeyL') { laps = laps >= 5 ? 1 : laps + 1; audio.ui(); refreshLobby(); pushStates(); }
    if (e.code === 'KeyO') { diff = (diff + 1) % DIFFS.length; audio.ui(); refreshLobby(); }
    if (kp && (e.code === 'ArrowLeft' || e.code === 'KeyA')) handleCommand(kp, { type: 'car', dir: -1 });
    if (kp && (e.code === 'ArrowRight' || e.code === 'KeyD')) handleCommand(kp, { type: 'car', dir: 1 });
  } else if (phase === 'results') {
    if (e.code === 'Enter') toLobby(true);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('pointerdown', () => audio.unlock());

function addKeyboardPlayer() {
  const slot = freeSlot();
  if (slot < 0) return;
  players.set(KBD, { pid: KBD, name: 'HRÁČ ' + (slot + 1), slot, carIdx: slot % CAR_TYPES.length, connected: true, input: { ...EMPTY_INPUT }, points: 0, waiting: false, lastBuzz: 0 });
  audio.ui();
  toast('Klávesnice připojena · ←/→ výběr auta · ENTER start');
  refreshLobby();
  pushStates();
}

// ------------------------------------------------------------------ hlavní smyčka
let last = performance.now();
let fpsAcc = 0, fpsN = 0, autoQuality = true;

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (dt <= 0) return;

  if (sim) {
    if (phase === 'countdown' || phase === 'race') {
      const kp = players.get(KBD);
      if (kp) kp.input = kbdInput();
      for (const p of players.values()) {
        const car = sim.carByPid(p.pid);
        if (!car || !car.human || car.finished) continue;
        const i = p.input;
        car.input.steer = +i.s || 0;
        car.input.brake = +i.b || 0;
        // plyn drží hra sama; pustí ho jen při brzdění (pak jde i couvat)
        car.input.throttle = car.input.brake > 0 ? 0 : 1;
        car.input.fire = !!i.f;
        car.input.secondary = !!i.r;
        car.input.drift = !!i.d;
      }
    }
    if (phase !== 'results') {
      const steps = dt > 0.034 ? 2 : 1;
      for (let i = 0; i < steps; i++) sim.step(dt / steps);
    } else {
      // za tabulkou výsledků auta volně dojíždějí
      sim.phase = 'racing';
      sim.attract = true;
      sim.step(dt);
    }
    const events = sim.events.splice(0);
    view.handleEvents(sim, events);
    onEvents(sim, events);
    view.update(sim, dt);

    if (phase === 'countdown' || phase === 'race') {
      hud.update(sim, dt);
      for (const p of players.values()) {
        const car = sim.carByPid(p.pid);
        if (car) audio.updateEngine(car.id, car.speed, car.stats.top, car.input.throttle, car.nitroOn, car.dead);
      }
      // stav pro displej ovladače
      hudSendT -= dt;
      if (hudSendT <= 0) {
        hudSendT = 0.25;
        for (const p of players.values()) {
          const car = sim.carByPid(p.pid);
          if (!car || p.pid === KBD || !p.connected) continue;
          const m: HostMsg = {
            type: 'hud', pos: car.rank, total: sim.cars.length, lap: Math.min(sim.laps, Math.max(1, car.lap + 1)), laps: sim.laps,
            hp: Math.max(0, car.hp / car.stats.hp), nitro: car.nitro, sec: car.secType, ammo: car.secAmmo, dead: car.dead, finished: car.finished,
          };
          socket.volatile.emit('host:to', { pid: p.pid, m });
        }
      }
      if (sim.phase === 'over' && phase === 'race') finishRace();
    } else if (phase === 'results') {
      resultsT -= dt;
      $('results-hint').textContent = master()?.pid === KBD || !master() ? `ENTER = pokračovat (${Math.ceil(resultsT)})` : `${master()!.name}: zmáčkni POKRAČOVAT (${Math.ceil(resultsT)})`;
      if (resultsT <= 0) toLobby(true);
    }
  }
  view.render(sim);

  // slabší počítač? po pár vteřinách pod 30 fps automaticky vypni stíny
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 4) {
    const fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0;
    if (autoQuality && fps < 30 && view.quality === 'high' && document.visibilityState === 'visible') {
      autoQuality = false;
      view.setQuality('low');
      toast('Nízké FPS – přepínám na rychlejší grafiku (G = zpět)', 4000);
    }
  }
}

startAttract();
refreshLobby();
requestAnimationFrame(frame);

// pro ladění z konzole prohlížeče
(window as unknown as Record<string, unknown>).fbc = { view, get sim() { return sim; }, players, startRace, addKeyboardPlayer, get phase() { return phase; } };
