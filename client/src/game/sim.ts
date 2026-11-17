/**
 * Herní simulace – fyzika aut, zbraně, pickupy, kola a pořadí.
 * Žádná grafika: vykreslování si jen čte stav (cars, bullets, rockets…) a fronty událostí (events).
 *
 * Souřadnice: rovina X/Z, Y je nahoru. Směr auta h: dopředu = (sin h, cos h).
 */
import { CarStats } from './cars';
import { BEAM_MIN_CHARGE, beamTime, type GunStats } from './guns';
import { Track, lateral, locate, wrapIdx } from './track';
import { aiThink, AIState, newAI } from './ai';

export interface CarInput {
  steer: number;    // -1 vlevo … 1 vpravo
  throttle: number; // 0…1
  brake: number;    // 0…1 (při stání = zpátečka)
  fire: boolean;
  secondary: boolean;
  /** tlačítko DRIFT – zadek auta ujede a auto se rychleji stáčí */
  drift: boolean;
}

export type SecType = 'rocket' | 'mine';
export type PickupKind = 'repair' | 'rocket' | 'mine' | 'nitro';

export interface Car {
  id: number;
  name: string;
  /** barva laku */
  color: number;
  /** barva pro jmenovku a minimapu */
  tagColor: number;
  typeIdx: number;
  stats: CarStats;
  /** řídí ho člověk? (když ne nebo když dojel, řídí AI) */
  human: boolean;
  pid: string | null;
  ai: AIState;
  input: CarInput;

  x: number; z: number; h: number;
  vx: number; vz: number;
  /** rychlost dopředu a do boku (m/s) */
  speed: number;
  slip: number;
  steer: number;
  yawRate: number;
  /** zrychlení dopředu (pro náklon karoserie) */
  accel: number;

  ti: number;   // index vzorku trati
  lat: number;  // boční odchylka
  lap: number;  // -1 před prvním projetím cíle
  rank: number; // 1 = první
  wrongWay: number;

  hp: number;
  /** zbývající čas zrychlení z modré bedny (s) */
  boost: number;
  /** boost jako 0…1 (pro ukazatel) */
  nitro: number;
  nitroOn: boolean;
  drifting: boolean;
  secType: SecType;
  secAmmo: number;
  /** primární zbraň (FIRE 1) */
  gun: GunStats;
  /** nabití laseru (s) – u ostatních zbraní 0 */
  charge: number;
  /** jak dlouho ještě svítí paprsek (s) */
  beam: number;
  /** jak dlouho svítit měl (pro ukazatel) */
  beamT: number;
  /** délka každého paprsku po první zásah (m) – jen pro vykreslení */
  beamLen: number[];
  fireCd: number;
  secCd: number;
  gunSide: number;

  dead: boolean;
  deadT: number;
  invuln: number;
  hitFlash: number;
  lastHitBy: number;
  lastHitT: number;
  wallT: number;

  finished: boolean;
  finishTime: number;
  place: number;
  kills: number;
  deaths: number;
  bestLap: number;
  lapStart: number;
  /** škálování rychlosti AI (obtížnost + "guma") */
  speedScale: number;
}

export interface Bullet { x: number; z: number; vx: number; vz: number; life: number; owner: number; ti: number; gun: GunStats; }
export interface Rocket { x: number; z: number; h: number; speed: number; life: number; owner: number; target: number; ti: number; id: number; }
export interface Mine { x: number; z: number; owner: number; age: number; id: number; }
export interface Pickup { x: number; z: number; kind: PickupKind; cooldown: number; id: number; }

export type SimEvent =
  | { t: 'count'; n: number }
  | { t: 'go' }
  | { t: 'shot'; car: number; x: number; z: number }
  | { t: 'hit'; car: number; x: number; z: number }
  | { t: 'spark'; x: number; z: number }
  | { t: 'wall'; car: number; x: number; z: number; force: number }
  | { t: 'crash'; a: number; b: number; x: number; z: number; force: number }
  | { t: 'boom'; x: number; z: number; size: number }
  | { t: 'launch'; car: number; kind: SecType }
  /** laser vystřelil – `len` je, jak dlouho bude svítit (s) */
  | { t: 'beam'; car: number; len: number }
  | { t: 'destroyed'; car: number; by: number }
  | { t: 'respawn'; car: number }
  | { t: 'pickup'; car: number; kind: PickupKind; x: number; z: number }
  | { t: 'lap'; car: number; lap: number; time: number }
  | { t: 'finish'; car: number; place: number };

export interface CarEntry {
  name: string;
  /** barva laku (barva auta) */
  color: number;
  /** barva jmenovky, minimapy a výsledků – u hráčů jejich slotová barva */
  tagColor: number;
  typeIdx: number;
  stats: CarStats;
  /** vybraná primární zbraň */
  gun: GunStats;
  human: boolean;
  pid: string | null;
}

export interface SimOptions {
  laps: number;
  /** nekonečná ukázková jízda na pozadí menu */
  attract?: boolean;
  /** 0.85 lehká … 1.0 těžká */
  aiSkill?: number;
  seed?: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
function approach(v: number, target: number, maxStep: number): number {
  return v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep);
}

/** Malý deterministický generátor náhodných čísel (ať jdou závody reprodukovat v testu). */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const COUNTDOWN_TIME = 3.6;
const ROCKET_DMG = 58;
const MINE_DMG = 52;
const CAR_R = 1.12;       // poloměr kolizních kruhů auta (dva: vpředu a vzadu)
const CAR_OFF = 1.0;

/**
 * Arkádové zatáčení: volant funguje naplno jen do rychlosti "steerRef" auta,
 * nad ní účinek klesá – auto nedotáčí a jede rovně. STEER_FALLOFF říká, jak prudce.
 * Díky tomu je mezi auty opravdu poznat rozdíl: formule zatáčí i ve dvou stech,
 * náklaďák se v té samé zatáčce jen vzepře.
 */
export const STEER_MULT = 1.08;
export const STEER_FALLOFF = 1.5;

/** Náraz do jiného auta: od jaké síly vůbec ubírá životy a jak málo. */
const RAM_MIN = 10;
const RAM_DAMAGE = 0.25;

/** Jak rychle se auto stáčí při dané rychlosti a plném volantu (rad/s). */
export function yawAt(st: CarStats, v: number): number {
  const sf = clamp(Math.abs(v) / 6, 0, 1);
  return (st.turn * STEER_MULT * sf) / (1 + Math.pow(Math.abs(v) / st.steerRef, STEER_FALLOFF));
}

/** Nejvyšší rychlost, při které auto ještě projede zatáčku s křivostí k (1/m). Používá AI. */
export function maxCornerSpeed(st: CarStats, k: number): number {
  if (k < 1e-4) return Infinity;
  // yawAt klesá s rychlostí, k*v roste – průsečík najdeme půlením intervalu
  let lo = 0, hi = st.top * 1.7;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (yawAt(st, mid) >= k * mid) lo = mid; else hi = mid;
  }
  return lo;
}
/** modrá bedna: na BOOST_TIME sekund zrychlí auto BOOST_SPEED× */
export const BOOST_TIME = 5;
export const BOOST_SPEED = 1.7;

export class Sim {
  track: Track;
  cars: Car[] = [];
  bullets: Bullet[] = [];
  rockets: Rocket[] = [];
  mines: Mine[] = [];
  pickups: Pickup[] = [];
  events: SimEvent[] = [];

  phase: 'countdown' | 'racing' | 'over' = 'countdown';
  countdown = COUNTDOWN_TIME;
  time = 0;         // čas závodu od "GO"
  laps: number;
  attract: boolean;
  finishCount = 0;
  /** čas, kdy dojel první člověk – 30 s potom závod končí všem */
  firstHumanFinish = -1;
  rnd: () => number;
  private nextId = 1;
  private lastCount = 4;

  constructor(track: Track, entries: CarEntry[], opts: SimOptions) {
    this.track = track;
    this.laps = opts.laps;
    this.attract = !!opts.attract;
    this.rnd = mulberry(opts.seed ?? (Math.random() * 1e9) | 0);
    const skill = opts.aiSkill ?? 0.93;

    // Startovní rošt: dvojice za sebou před cílovou čárou. AI vepředu, lidé vzadu (víc předjíždění).
    const order = [...entries].sort((a, b) => Number(a.human) - Number(b.human));
    order.forEach((e, k) => {
      const row = Math.floor(k / 2);
      const ti = wrapIdx(track, track.n - 5 - row * 5);
      const side = k % 2 === 0 ? 1 : -1;
      const off = side * track.halfWidth * 0.42;
      const car: Car = {
        id: entries.indexOf(e),
        name: e.name, color: e.color, tagColor: e.tagColor, typeIdx: e.typeIdx, stats: e.stats,
        human: e.human, pid: e.pid,
        ai: newAI(this.rnd, skill),
        input: { steer: 0, throttle: 0, brake: 0, fire: false, secondary: false, drift: false },
        x: track.x[ti] + track.nx[ti] * off,
        z: track.z[ti] + track.nz[ti] * off,
        h: Math.atan2(track.tx[ti], track.tz[ti]),
        vx: 0, vz: 0, speed: 0, slip: 0, steer: 0, yawRate: 0, accel: 0,
        ti, lat: off, lap: -1, rank: k + 1, wrongWay: 0,
        hp: e.stats.hp, boost: 0, nitro: 0, nitroOn: false, drifting: false,
        secType: 'rocket', secAmmo: 2, gun: e.gun, charge: 0, beam: 0, beamT: 0, beamLen: [],
        fireCd: 0, secCd: 0, gunSide: 1,
        dead: false, deadT: 0, invuln: 0, hitFlash: 0, lastHitBy: -1, lastHitT: -99, wallT: 0,
        finished: false, finishTime: 0, place: 0, kills: 0, deaths: 0, bestLap: 0, lapStart: 0,
        speedScale: 1,
      };
      if (this.attract) { car.lap = 0; }
      this.cars.push(car);
    });
    this.cars.sort((a, b) => a.id - b.id);
    this.placePickups();
    if (this.attract) { this.phase = 'racing'; this.countdown = 0; }
  }

  /** Bedny: po trati v řadách po třech. */
  private placePickups() {
    const tr = this.track;
    const rows = Math.max(6, Math.round(tr.length / 150));
    const kinds: PickupKind[] = ['rocket', 'repair', 'nitro', 'mine'];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const ti = wrapIdx(tr, Math.round(((r + 0.45) / rows) * tr.n));
      for (const lane of [-1, 0, 1]) {
        const off = lane * tr.halfWidth * 0.55;
        this.pickups.push({
          x: tr.x[ti] + tr.nx[ti] * off,
          z: tr.z[ti] + tr.nz[ti] * off,
          kind: kinds[k++ % kinds.length],
          cooldown: 0,
          id: this.nextId++,
        });
      }
      k++; // posun, ať nejsou řady stejné
    }
  }

  carByPid(pid: string): Car | undefined {
    return this.cars.find((c) => c.pid === pid);
  }

  /** Jeden krok simulace. dt v sekundách (max ~1/30). */
  step(dt: number) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.6);
      if (n !== this.lastCount && n >= 1 && n <= 3) { this.lastCount = n; this.events.push({ t: 'count', n }); }
      if (this.countdown <= 0.6 && this.phase === 'countdown') {
        this.phase = 'racing';
        this.events.push({ t: 'go' });
        for (const c of this.cars) c.lapStart = 0;
      }
      return;
    }
    this.time += dt;

    this.updateRubberBand();

    for (const c of this.cars) {
      if (!c.human || c.finished) aiThink(this, c, dt);
      this.stepCar(c, dt);
    }
    this.collideCars();
    this.stepWeapons(dt);
    this.stepPickups(dt);
    this.updateRanks();

    if (this.phase === 'racing' && !this.attract) {
      const humans = this.cars.filter((c) => c.human);
      const allHumansDone = humans.length > 0 && humans.every((c) => c.finished);
      const timeout = this.firstHumanFinish >= 0 && this.time - this.firstHumanFinish > 30;
      const noHumans = humans.length === 0 && this.cars.some((c) => c.finished);
      if (allHumansDone || timeout || noHumans) this.endRace();
    }
  }

  /** Ukončí závod; kdo nedojel, dostane umístění podle aktuálního pořadí. */
  endRace() {
    if (this.phase === 'over') return;
    const rest = this.cars.filter((c) => !c.finished).sort((a, b) => a.rank - b.rank);
    for (const c of rest) {
      c.finished = true;
      c.place = ++this.finishCount;
      c.finishTime = 0;
    }
    this.phase = 'over';
  }

  private updateRubberBand() {
    // AI trochu zpomalí, když ujíždí lidem, a přidá, když zaostává – závod zůstane napínavý.
    let best = -Infinity;
    for (const c of this.cars) if (c.human && !c.finished) best = Math.max(best, this.progress(c));
    for (const c of this.cars) {
      if (c.human && !c.finished) { c.speedScale = 1; continue; }
      let s = c.ai.skill;
      if (best > -Infinity) {
        const gap = (this.progress(c) - best) * this.track.step; // metry před nejlepším člověkem
        if (gap > 40) s *= 1 - clamp((gap - 40) / 400, 0, 0.1);
        else if (gap < -60) s *= 1 + clamp((-gap - 60) / 500, 0, 0.07);
      }
      c.speedScale = s;
    }
  }

  progress(c: Car): number {
    return c.lap * this.track.n + c.ti;
  }

  private updateRanks() {
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.place - b.place;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return this.progress(b) - this.progress(a);
    });
    sorted.forEach((c, i) => (c.rank = i + 1));
  }

  // ------------------------------------------------------------------ auto
  private stepCar(c: Car, dt: number) {
    const tr = this.track;
    const st = c.stats;
    c.fireCd -= dt; c.secCd -= dt;
    c.invuln = Math.max(0, c.invuln - dt);
    c.hitFlash = Math.max(0, c.hitFlash - dt);
    c.wallT = Math.max(0, c.wallT - dt);

    if (c.dead) {
      // vrak ještě chvíli klouže
      const k = Math.exp(-1.6 * dt);
      c.vx *= k; c.vz *= k;
      c.x += c.vx * dt; c.z += c.vz * dt;
      c.h += c.yawRate * dt;
      c.yawRate *= Math.exp(-1.2 * dt);
      c.speed = 0; c.accel = 0; c.nitroOn = false; c.drifting = false;
      const prevDead = c.ti;
      this.keepInside(c, dt, true);
      this.lapCheck(c, prevDead); // i vrak, který se dosune přes cíl, má kolo započítané
      c.deadT -= dt;
      if (c.deadT <= 0) this.respawn(c);
      return;
    }

    const inp = c.input;
    const steerIn = clamp(inp.steer, -1, 1);
    // volant: do zatáčky pomaleji, zpět rychleji
    const sr = Math.abs(steerIn) < Math.abs(c.steer) || steerIn * c.steer < 0 ? 8 : 5;
    c.steer = approach(c.steer, steerIn, sr * dt);

    let fx = Math.sin(c.h), fz = Math.cos(c.h);
    let vf = c.vx * fx + c.vz * fz;

    // zrychlení z modré bedny – žádné tlačítko, prostě běží, dokud nevyprší
    c.boost = Math.max(0, c.boost - dt);
    c.nitroOn = c.boost > 0;
    c.nitro = c.boost / BOOST_TIME;
    const throttle = clamp(inp.throttle, 0, 1);
    const brake = clamp(inp.brake, 0, 1);

    c.drifting = inp.drift && vf > 8;

    const top = st.top * c.speedScale * (c.nitroOn ? BOOST_SPEED : 1);
    const acc = st.accel * c.speedScale * (c.nitroOn ? 2.2 : 1);
    let a = 0;
    if (throttle > 0) {
      const r = vf / top;
      a += r < 1 ? acc * throttle * (1 - r * r * r) : -acc * (r - 1) * 2.5;
    }
    if (brake > 0) {
      if (vf > 0.5) a -= st.brake * brake * (c.drifting ? 0.3 : 1);
      else if (throttle < 0.1) a -= 15 * brake * (1 + Math.max(-1, vf / 16)); // zpátečka do ~16 m/s
    }
    a -= vf * 0.1;
    if (throttle === 0 && brake === 0) a -= Math.sign(vf) * 2.2;
    c.accel = a;

    // ---- zatáčení (viz yawAt: ve stoje nic, ve vysoké rychlosti nedotáčivost podle steerRef)
    let yaw = -c.steer * yawAt(st, vf) * (vf >= 0 ? 1 : -1);
    if (c.drifting) yaw *= 1.5; // drift: zadek ujede a auto se stočí mnohem víc
    c.yawRate = yaw;
    c.h += yaw * dt;

    fx = Math.sin(c.h); fz = Math.cos(c.h);
    c.vx += fx * a * dt; c.vz += fz * a * dt;

    // ---- boční přilnavost
    const rx = -fz, rz = fx;
    vf = c.vx * fx + c.vz * fz;
    let vl = c.vx * rx + c.vz * rz;
    let grip = st.grip;
    grip *= 1 - 0.4 * clamp(Math.abs(vl) / 14, 0, 1);               // rozjetý smyk chvíli vydrží
    if (throttle > 0.5 && Math.abs(vf) > 14) grip *= 0.86;          // plný plyn rozhoupe zadek
    if (c.drifting) grip *= 0.2;
    vl *= Math.exp(-grip * dt);
    if (Math.abs(vf) < 0.15 && throttle === 0 && brake === 0) vf = 0;
    c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
    c.speed = vf; c.slip = Math.abs(vl);

    // ---- srovnání po smyku: jakmile hráč pustí volant, auto se samo natočí po směru jízdy.
    // Bez téhle pomoci by se s tlačítky na telefonu ze smyku skoro nedalo dostat.
    if (!c.drifting && vf > 5) {
      const slipAng = angDiff(Math.atan2(c.vx, c.vz), c.h);
      if (Math.abs(slipAng) > 0.12) {
        const k = (1 - Math.abs(c.steer)) * 2.4 * clamp(Math.abs(slipAng) / 0.4, 0, 1);
        c.h += clamp(slipAng, -0.9, 0.9) * k * dt;
      }
    }

    c.x += c.vx * dt; c.z += c.vz * dt;

    const prev = c.ti;
    this.keepInside(c, dt, false);

    this.lapCheck(c, prev);

    // protisměr
    const along = fx * tr.tx[c.ti] + fz * tr.tz[c.ti];
    if (along < -0.3 && vf > 4) c.wrongWay += dt; else c.wrongWay = 0;

    // zbraně
    if (!c.finished && this.phase === 'racing') {
      if (c.gun.kind === 'beam') this.stepCharge(c, inp.fire, dt);
      else if (inp.fire && c.fireCd <= 0) this.fireGun(c);
      if (inp.secondary && c.secCd <= 0 && c.secAmmo > 0) this.fireSecondary(c);
    } else if (c.gun.kind === 'beam') {
      c.charge = 0;
    }
  }

  /** Projelo auto cílem? (prev = index vzorku trati před posunem) */
  private lapCheck(c: Car, prev: number) {
    const n = this.track.n;
    const d = c.ti - prev;
    if (d < -n / 2) {
      c.lap++;
      if (!this.attract && c.lap >= 1 && !c.finished) {
        const lapTime = this.time - c.lapStart;
        c.lapStart = this.time;
        if (!c.bestLap || lapTime < c.bestLap) c.bestLap = lapTime;
        if (c.lap >= this.laps) {
          c.finished = true;
          c.finishTime = this.time;
          c.place = ++this.finishCount;
          if (c.human && this.firstHumanFinish < 0) this.firstHumanFinish = this.time;
          this.events.push({ t: 'finish', car: c.id, place: c.place });
        } else {
          this.events.push({ t: 'lap', car: c.id, lap: c.lap + 1, time: lapTime });
        }
      } else if (c.lap === 0) c.lapStart = this.time;
    } else if (d > n / 2) c.lap--;
  }

  /** Svodidla: auto nesmí ven z koridoru trati. */
  private keepInside(c: Car, dt: number, wreck: boolean) {
    const tr = this.track;
    c.ti = locate(tr, c.x, c.z, c.ti);
    const i = c.ti;
    c.lat = lateral(tr, i, c.x, c.z);
    const limit = tr.wallDist - 1.05;
    if (Math.abs(c.lat) <= limit) return;
    const sgn = Math.sign(c.lat);
    const nx = tr.nx[i] * sgn, nz = tr.nz[i] * sgn; // směr ven
    const pen = Math.abs(c.lat) - limit;
    c.x -= nx * pen; c.z -= nz * pen;
    c.lat = sgn * limit;
    const vn = c.vx * nx + c.vz * nz;
    if (vn > 0) {
      c.vx -= nx * vn * 1.25; c.vz -= nz * vn * 1.25;
      const fr = 1 - Math.min(0.35, vn * 0.012);
      c.vx *= fr; c.vz *= fr;
      if (!wreck) {
        // Do svodidel se auto jen otře – žádné poškození, jen ztráta rychlosti a jiskry.
        if (vn > 2.5 && c.wallT <= 0) {
          c.wallT = 0.12;
          this.events.push({ t: 'wall', car: c.id, x: c.x + nx * 1.0, z: c.z + nz * 1.0, force: vn });
        }
      }
    }
    if (!wreck) {
      // arkádová pomoc: srovnej auto podél zdi, ať se nezasekne čumákem ve svodidlech
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      const dir = fx * tr.tx[i] + fz * tr.tz[i] >= -0.2 ? 1 : -1;
      const target = Math.atan2(tr.tx[i] * dir, tr.tz[i] * dir);
      c.h += angDiff(target, c.h) * Math.min(1, 3.2 * dt);
    }
  }

  private collideCars() {
    const cs = this.cars;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        const dx0 = b.x - a.x, dz0 = b.z - a.z;
        if (dx0 * dx0 + dz0 * dz0 > 36) continue;
        // dva kruhy na auto (příď/záď)
        let best = 0, bnx = 0, bnz = 0;
        for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
          const ax = a.x + Math.sin(a.h) * CAR_OFF * sa, az = a.z + Math.cos(a.h) * CAR_OFF * sa;
          const bx = b.x + Math.sin(b.h) * CAR_OFF * sb, bz = b.z + Math.cos(b.h) * CAR_OFF * sb;
          const dx = bx - ax, dz = bz - az;
          const d = Math.hypot(dx, dz);
          const pen = CAR_R * 2 - d;
          if (pen > best) { best = pen; bnx = d > 1e-4 ? dx / d : 1; bnz = d > 1e-4 ? dz / d : 0; }
        }
        if (best <= 0) continue;
        const ma = a.dead ? a.stats.mass * 0.6 : a.stats.mass, mb = b.dead ? b.stats.mass * 0.6 : b.stats.mass;
        const tot = ma + mb;
        a.x -= bnx * best * (mb / tot); a.z -= bnz * best * (mb / tot);
        b.x += bnx * best * (ma / tot); b.z += bnz * best * (ma / tot);
        const rv = (b.vx - a.vx) * bnx + (b.vz - a.vz) * bnz;
        if (rv < 0) {
          const jimp = (-(1 + 0.5) * rv) / (1 / ma + 1 / mb); // pořádně odhodí (těžké auto lehké)
          a.vx -= (jimp / ma) * bnx; a.vz -= (jimp / ma) * bnz;
          b.vx += (jimp / mb) * bnx; b.vz += (jimp / mb) * bnz;
          const force = -rv;
          if (force > 5) {
            // Náraz hlavně odhazuje. Životy ubere jen symbolicky – ničí se zbraněmi.
            if (!a.dead && !b.dead && force > RAM_MIN) {
              this.damage(a, (force - RAM_MIN) * RAM_DAMAGE * (mb / tot), b.id);
              this.damage(b, (force - RAM_MIN) * RAM_DAMAGE * (ma / tot), a.id);
            }
            this.events.push({ t: 'crash', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, force });
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ zbraně
  /** Nejbližší soupeř v kuželu před autem (pro lehké automatické míření). */
  findTarget(c: Car, cone: number, range: number): Car | null {
    let best: Car | null = null, bs = Infinity;
    for (const o of this.cars) {
      if (o === c || o.dead || o.finished) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 2) continue;
      const a = Math.abs(angDiff(Math.atan2(dx, dz), c.h));
      if (a > cone) continue;
      const score = a * 60 + d;
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  private fireGun(c: Car) {
    const g = c.gun;
    c.fireCd = g.cd;
    c.gunSide = -c.gunSide;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    // odkud to letí: z kapoty střídavě zleva a zprava, z boků z obou dveří naráz
    const side = g.mount === 'side';
    const lat = side ? 1.02 : 0.5, fwd = side ? 0.5 : 1.6;
    const sides = g.twin ? [-1, 1] : [c.gunSide];
    // zamíří se jednou ze středu auta a obě střely pak letí rovnoběžně
    const mx = c.x + fx * fwd, mz = c.z + fz * fwd;
    let dir = c.h;
    const tgt = g.cone > 0 && g.aim > 0 ? this.findTarget(c, g.cone, g.range) : null;
    if (tgt) {
      // míření s předstihem – ale jen část opravy a nejvýš o `aimMax`
      const d = Math.hypot(tgt.x - mx, tgt.z - mz);
      const tt = d / (g.speed + Math.max(0, c.speed));
      const want = Math.atan2(tgt.x + tgt.vx * tt - mx, tgt.z + tgt.vz * tt - mz);
      dir = c.h + clamp(angDiff(want, c.h) * g.aim, -g.aimMax, g.aimMax);
    }
    const spread = c.human ? g.spread : Math.max(g.spread, c.ai.spread);
    dir += (this.rnd() - 0.5) * 2 * spread;
    const sp = g.speed + Math.max(0, c.speed);
    for (const sgn of sides) {
      const sx = mx - fz * lat * sgn, sz = mz + fx * lat * sgn;
      this.bullets.push({
        x: sx, z: sz, vx: Math.sin(dir) * sp, vz: Math.cos(dir) * sp,
        life: g.range / sp, owner: c.id, ti: c.ti, gun: g,
      });
      this.events.push({ t: 'shot', car: c.id, x: sx, z: sz });
    }
  }

  /**
   * Laser: drženým FIRE 1 se nabíjí, puštěním vystřelí.
   * Čím déle se nabíjel, tím déle paprsek svítí (nejvýš BEAM_MAX sekund).
   */
  private stepCharge(c: Car, held: boolean, dt: number) {
    const g = c.gun;
    if (c.beam > 0 || c.fireCd > 0) { c.charge = 0; return; } // během paprsku ani prodlevy se nenabíjí
    if (held) {
      c.charge = Math.min(g.chargeMax ?? 1, c.charge + dt);
      // bot nedrží donekonečna – jakmile je plno, pálí
      if (!c.human && c.charge >= (g.chargeMax ?? 1)) this.fireBeam(c);
    } else if (c.charge > 0) {
      if (c.charge >= BEAM_MIN_CHARGE) this.fireBeam(c);
      else c.charge = 0; // ťuknutí nestačí
    }
  }

  private fireBeam(c: Car) {
    c.beamT = beamTime(c.gun, c.charge);
    c.beam = c.beamT;
    c.beamLen = this.beamSides(c).map(() => c.gun.range);
    c.charge = 0;
    this.events.push({ t: 'beam', car: c.id, len: c.beamT });
  }

  /** Z kolika míst auto pálí: dvojitá zbraň zleva i zprava, jinak jen ze středu. */
  private beamSides(c: Car): number[] {
    return c.gun.twin ? [-1, 1] : [0];
  }

  /**
   * Paprsky: pálí rovně dopředu z míst, kde zbraň na autě sedí (u PRISM z obou dveří),
   * každý si najde první auto v cestě a ubírá mu život po celou dobu, co na něm drží.
   */
  private stepBeams(dt: number) {
    for (const c of this.cars) {
      if (c.beam <= 0) continue;
      const g = c.gun;
      if (c.dead || c.finished || this.phase !== 'racing') { c.beam = 0; c.fireCd = g.cd; continue; }
      c.beam = Math.max(0, c.beam - dt);
      if (c.beam <= 0) { c.fireCd = g.cd; continue; }
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      const side = g.mount === 'side';
      const lat = side ? c.stats.shape.width * 0.48 : 0.45;
      const fwd = side ? 0.9 : 1.6;
      this.beamSides(c).forEach((sgn, k) => {
        const ox = c.x + fx * fwd - fz * lat * sgn, oz = c.z + fz * fwd + fx * lat * sgn;
        let hit: Car | null = null, hitT = g.range;
        for (const o of this.cars) {
          if (o === c || o.dead || o.finished) continue;
          const dx = o.x - ox, dz = o.z - oz;
          const t = dx * fx + dz * fz;                    // jak daleko podél paprsku
          if (t < 0 || t > hitT) continue;
          if (Math.abs(dx * fz - dz * fx) > (g.beamR ?? 1.6)) continue; // kolmá odchylka
          hit = o; hitT = t;
        }
        c.beamLen[k] = hitT;
        if (!hit) return;
        // AI pálí do lidí slabším paprskem, ať to není frustrující
        this.damage(hit, g.dmg * dt * (!c.human && hit.human ? 0.55 : 1), c.id);
        if (this.rnd() < dt * 10) this.events.push({ t: 'hit', car: hit.id, x: hit.x, z: hit.z });
      });
    }
  }

  private fireSecondary(c: Car) {
    c.secAmmo--;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    if (c.secType === 'rocket') {
      c.secCd = 0.7;
      const tgt = this.findTarget(c, 0.5, 130);
      this.rockets.push({
        x: c.x + fx * 2, z: c.z + fz * 2, h: c.h, speed: Math.max(35, c.speed + 25),
        life: 3.2, owner: c.id, target: tgt ? tgt.id : -1, ti: c.ti, id: this.nextId++,
      });
    } else {
      c.secCd = 0.5;
      this.mines.push({ x: c.x - fx * 3.2, z: c.z - fz * 3.2, owner: c.id, age: 0, id: this.nextId++ });
      if (this.mines.length > 24) this.mines.shift();
    }
    this.events.push({ t: 'launch', car: c.id, kind: c.secType });
  }

  private stepWeapons(dt: number) {
    const tr = this.track;
    this.stepBeams(dt);
    // --- kulky
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const ox = b.x, oz = b.z;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.life -= dt;
      let gone = b.life <= 0;
      if (!gone) {
        const mx = (ox + b.x) / 2, mz = (oz + b.z) / 2;
        for (const c of this.cars) {
          if (c.id === b.owner || c.dead) continue;
          const d1 = (c.x - b.x) ** 2 + (c.z - b.z) ** 2, d2 = (c.x - mx) ** 2 + (c.z - mz) ** 2;
          if (d1 < 3.0 || d2 < 3.0) {
            const owner = this.cars[b.owner];
            // AI střílí do lidí o něco slabším kalibrem, ať to není frustrující
            const dmg = b.gun.dmg * (owner && !owner.human && c.human ? 0.55 : 1);
            this.damage(c, dmg, b.owner);
            this.events.push({ t: 'hit', car: c.id, x: b.x, z: b.z });
            gone = true;
            break;
          }
        }
      }
      if (!gone) {
        b.ti = locate(tr, b.x, b.z, b.ti, 5);
        if (Math.abs(lateral(tr, b.ti, b.x, b.z)) > tr.wallDist) {
          gone = true;
          this.events.push({ t: 'spark', x: b.x, z: b.z });
        }
      }
      if (gone) { this.bullets[i] = this.bullets[this.bullets.length - 1]; this.bullets.pop(); }
    }
    // --- rakety
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.speed = Math.min(105, r.speed + 90 * dt);
      const tgt = r.target >= 0 ? this.cars[r.target] : null;
      if (tgt && !tgt.dead) {
        const want = Math.atan2(tgt.x - r.x, tgt.z - r.z);
        r.h += clamp(angDiff(want, r.h), -2.2 * dt, 2.2 * dt);
      }
      r.x += Math.sin(r.h) * r.speed * dt; r.z += Math.cos(r.h) * r.speed * dt;
      r.life -= dt;
      let boom = r.life <= 0;
      for (const c of this.cars) {
        if (c.id === r.owner || c.dead) continue;
        if ((c.x - r.x) ** 2 + (c.z - r.z) ** 2 < 5.3) { boom = true; break; }
      }
      if (!boom) {
        r.ti = locate(tr, r.x, r.z, r.ti, 5);
        if (Math.abs(lateral(tr, r.ti, r.x, r.z)) > tr.wallDist - 0.2) boom = true;
      }
      if (boom) {
        this.explode(r.x, r.z, 8.5, ROCKET_DMG, r.owner);
        this.rockets.splice(i, 1);
      }
    }
    // --- miny
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.age += dt;
      let boom = m.age > 45;
      if (m.age > 0.5) {
        for (const c of this.cars) {
          if (c.dead || (c.id === m.owner && m.age < 2)) continue;
          if ((c.x - m.x) ** 2 + (c.z - m.z) ** 2 < 6.2) { boom = true; break; }
        }
      }
      if (boom) {
        this.explode(m.x, m.z, 6.5, MINE_DMG, m.owner);
        this.mines.splice(i, 1);
      }
    }
  }

  explode(x: number, z: number, radius: number, dmg: number, owner: number) {
    this.events.push({ t: 'boom', x, z, size: radius / 8 });
    for (const c of this.cars) {
      if (c.dead) continue;
      const dx = c.x - x, dz = c.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const f = 1 - (d / radius) * 0.75;
      const imp = (16 * f) / c.stats.mass;
      const l = d > 0.01 ? d : 1;
      c.vx += (dx / l) * imp; c.vz += (dz / l) * imp;
      const ownerCar = this.cars[owner];
      let amount = dmg * f * (c.id === owner ? 0.4 : 1);
      if (ownerCar && !ownerCar.human && c.human) amount *= 0.7;
      this.damage(c, amount, owner);
    }
  }

  damage(c: Car, amount: number, by: number) {
    if (c.dead || c.invuln > 0 || c.finished || this.phase !== 'racing' || amount <= 0) return;
    c.hp -= amount;
    c.hitFlash = 0.25;
    if (by >= 0 && by !== c.id) { c.lastHitBy = by; c.lastHitT = this.time; }
    if (c.hp <= 0) this.destroy(c);
  }

  private destroy(c: Car) {
    c.hp = 0;
    c.dead = true;
    c.deadT = 2.6;
    c.deaths++;
    c.yawRate = (this.rnd() - 0.5) * 9;
    let by = -1;
    if (c.lastHitBy >= 0 && this.time - c.lastHitT < 6) {
      by = c.lastHitBy;
      const k = this.cars[by];
      if (k) k.kills++;
    }
    this.events.push({ t: 'boom', x: c.x, z: c.z, size: 1.5 });
    this.events.push({ t: 'destroyed', car: c.id, by });
  }

  respawn(c: Car) {
    const tr = this.track;
    const ti = c.ti;
    // najdi volný pruh
    let off = 0;
    for (const cand of [0, 4, -4, 6.5, -6.5]) {
      const px = tr.x[ti] + tr.nx[ti] * cand, pz = tr.z[ti] + tr.nz[ti] * cand;
      if (this.cars.every((o) => o === c || o.dead || (o.x - px) ** 2 + (o.z - pz) ** 2 > 16)) { off = cand; break; }
    }
    c.x = tr.x[ti] + tr.nx[ti] * off; c.z = tr.z[ti] + tr.nz[ti] * off;
    c.h = Math.atan2(tr.tx[ti], tr.tz[ti]);
    c.vx = tr.tx[ti] * 14; c.vz = tr.tz[ti] * 14;
    c.speed = 14; c.steer = 0; c.yawRate = 0;
    c.hp = c.stats.hp;
    c.dead = false;
    c.invuln = 2.5;
    c.lastHitBy = -1;
    c.ai.stuckT = 0;
    this.events.push({ t: 'respawn', car: c.id });
  }

  // ------------------------------------------------------------------ pickupy
  private stepPickups(dt: number) {
    for (const p of this.pickups) {
      if (p.cooldown > 0) { p.cooldown -= dt; continue; }
      for (const c of this.cars) {
        if (c.dead || c.finished) continue;
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 > 6.8) continue;
        if (p.kind === 'repair') {
          if (c.hp >= c.stats.hp) continue; // plné zdraví = nech bednu ostatním
          c.hp = Math.min(c.stats.hp, c.hp + c.stats.hp * 0.5);
        } else if (p.kind === 'nitro') {
          c.boost = BOOST_TIME;
        } else {
          if (c.secType === p.kind) c.secAmmo = Math.min(6, c.secAmmo + 3);
          else { c.secType = p.kind; c.secAmmo = 3; }
        }
        p.cooldown = 7;
        this.events.push({ t: 'pickup', car: c.id, kind: p.kind, x: p.x, z: p.z });
        break;
      }
    }
  }
}
