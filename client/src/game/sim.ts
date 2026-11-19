/**
 * Herní simulace – fyzika aut, zbraně, pickupy, kola a pořadí.
 * Žádná grafika: vykreslování si jen čte stav (cars, bullets, rockets…) a fronty událostí (events).
 *
 * Souřadnice: rovina X/Z, Y je nahoru. Směr auta h: dopředu = (sin h, cos h).
 */
import { CarStats } from './cars';
import { BEAM_MIN_CHARGE, beamTime, type GunStats } from './guns';
import type { SecKind, SecStats } from './secondary';
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

export type PickupKind = 'repair' | 'rocket' | 'nitro';

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
  /** zatáčí plynule (náklon telefonu) */
  analog: boolean;
  /** vypnutý motor (testovací plac): auto nepřidává, nejde couvat a nehučí */
  engineOff: boolean;
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
  /** sekundární zbraň (FIRE 2) */
  sec: SecStats;
  secAmmo: number;
  /** primární zbraň (FIRE 1) */
  gun: GunStats;
  /** nabití laseru (s) – u ostatních zbraní 0 */
  charge: number;
  /** FIRE 1 v minulém snímku – kvůli rozpoznání nového stisku */
  firePrev: boolean;
  /** cheat: pomocné brzdy zapnuté pro tohle auto (hráč si je přepíná i během závodu) */
  assist: boolean;
  /** kolik brzdy teď asistent drží (0–1) – hladí se, ať to necuká; 0 = nedělá nic */
  assistK: number;
  /** kolik asistent zrovna ubírá plyn (0–1) */
  assistLift: number;
  /** rušení po zásahu EMP: zbývající čas celkem, čas do přehození šipky, délka jedné šipky a směr */
  jam: number; jamT: number; jamEvery: number; jamDir: number;
  /** jak dlouho ještě svítí paprsek (s) */
  beam: number;
  /** jak dlouho svítit měl (pro ukazatel) */
  beamT: number;
  /** délka každého paprsku po první zásah (m) – jen pro vykreslení */
  beamLen: number[];
  /** kdy naposledy paprsek zasáhl které auto (podle id) – ať jedna rána platí jednou */
  beamHitAt: number[];
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
/**
 * Něco, co auto pustilo na trať – mina nebo míček. Jede to stejným kódem, liší se jen čísly
 * v `def` a tím, že míček po vyhození ještě chvíli letí a kutálí se (mina má rychlosti nulové).
 * `arm` se musí odtikat, než to začne reagovat (ať si to auto nehodí pod sebe),
 * `fuse` > 0 znamená, že to zapálil cizí výbuch a za chvilku to bouchne taky (řetězová reakce).
 */
/**
 * Lanový hák. Nejdřív letí dopředu (`fly`), když se trefí do cizího auta, zahákne se (`hold`)
 * a lano táhne střelce k zaháknutému autu. Když se netrefí nebo čas vyprší, navíjí se zpátky (`back`).
 * Každé auto může mít ve vzduchu jen jeden.
 */
/**
 * EMP vlna. Roztahuje se z auta do kruhu a každému, koho poprvé přejde, dá ránu
 * a zblázní volant. `hit` si pamatuje, komu už se to stalo, ať to nesebere dvakrát.
 */
export interface Wave {
  owner: number;
  x: number; z: number;
  /** jak dlouho už se roztahuje (s) */
  t: number;
  /** aktuální poloměr (m) */
  r: number;
  gun: GunStats;
  hit: number[];
  id: number;
}

export interface Hook {
  owner: number;
  /** id zaháknutého auta, nebo -1 když hák ještě letí / nic nechytil */
  target: number;
  x: number; z: number; vx: number; vz: number;
  state: 'fly' | 'hold' | 'back';
  /** kolik dráhy hák uletěl (m) – podle toho se pozná, že je na konci lana */
  flown: number;
  /** zbývající čas tahu (s) */
  t: number;
  def: SecStats;
  id: number;
}

export interface Drop {
  x: number; z: number;
  /** výška nad zemí – míček poskakuje, mina leží na nule */
  y: number;
  vx: number; vz: number; vy: number;
  /** jen pro kreslení: o kolik se míček odkutálel a kterým směrem */
  roll: number; yaw: number;
  owner: number; arm: number; life: number; fuse: number; def: SecStats; id: number;
}
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
  | { t: 'launch'; car: number; kind: SecKind }
  | { t: 'hooked'; car: number; x: number; z: number }
  | { t: 'wave'; car: number; x: number; z: number }
  | { t: 'charge'; car: number }
  | { t: 'jammed'; car: number }
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
  /** vybraná sekundární zbraň */
  sec: SecStats;
  /** cheat: pomocné brzdy – auto si samo ubere rychlost před zatáčkou (každý hráč zvlášť) */
  assist?: boolean;
  human: boolean;
  pid: string | null;
  /** plynulé zatáčení (náklon telefonu) – volant se pak smí otáčet rychleji než u tlačítek */
  analog?: boolean;
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
/**
 * Kam vystřelit hák, aby za letu potkal pohyblivý cíl – klasické "vedení" cíle.
 * Řeší se kvadratická rovnice |D + V·t| = speed·t, kde D je vektor k cíli a V jeho rychlost.
 * Vrací směr na předpovězené místo, nebo null, když cíl utíká rychleji, než hák letí.
 */
function interceptDir(ox: number, oz: number, t: Car, speed: number): number | null {
  const dx = t.x - ox, dz = t.z - oz;
  const a = t.vx * t.vx + t.vz * t.vz - speed * speed;
  const b = 2 * (dx * t.vx + dz * t.vz);
  const cc = dx * dx + dz * dz;
  let time: number;
  if (Math.abs(a) < 1e-4) {
    if (Math.abs(b) < 1e-6) return null;
    time = -cc / b;
  } else {
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const r = Math.sqrt(disc);
    const t1 = (-b + r) / (2 * a), t2 = (-b - r) / (2 * a);
    time = Math.min(...[t1, t2].filter((v) => v > 0));
  }
  if (!Number.isFinite(time) || time <= 0) return null;
  return Math.atan2(dx + t.vx * time, dz + t.vz * time);
}

/** Kde na autě sedí vrhač háku – vpravo na kapotě, kousek před čelním sklem. */
function hookMuzzle(c: Car): { x: number; z: number } {
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  // auto míří po (sin h, cos h); doprava od řidiče je tedy (−cos h, sin h)
  const rx = -fz, rz = fx;
  const fwd = c.stats.shape.length * 0.42, side = c.stats.shape.width * 0.3;
  return { x: c.x + fx * fwd + rx * side, z: c.z + fz * fwd + rz * side };
}
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
/** Nejvíc věcí (min a míčků), co smí naráz ležet na trati – víc jich na zem nepustíme. */
export const MAX_DROPS = 420;
/** Fyzika míčků: brzdění kutálením (1/s), tíha (m/s²) a kolik rychlosti zbyde po odrazu. */
const BALL_DRAG = 1.9, BALL_G = 20, BALL_BOUNCE = 0.42, BALL_R = 0.17;
const BEAM_TWIN: readonly number[] = [-1, 1];
const BEAM_SINGLE: readonly number[] = [0];
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
  /** miny a míčky ležící na trati */
  drops: Drop[] = [];
  /** lanové háky ve vzduchu nebo zaháknuté */
  hooks: Hook[] = [];
  /** rozpínající se EMP vlny */
  waves: Wave[] = [];
  pickups: Pickup[] = [];
  events: SimEvent[] = [];
  /** pracovní pole na řazení pořadí – ať se každý snímek nealokuje nové */
  private rankBuf: Car[] = [];

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
      const off = side * Math.min(track.halfWidth * 0.42, 4.5); // na široké trati drž rošt pohromadě
      const car: Car = {
        id: entries.indexOf(e),
        name: e.name, color: e.color, tagColor: e.tagColor, typeIdx: e.typeIdx, stats: e.stats,
        human: e.human, pid: e.pid, analog: !!e.analog, engineOff: false,
        ai: newAI(this.rnd, skill),
        input: { steer: 0, throttle: 0, brake: 0, fire: false, secondary: false, drift: false },
        x: track.x[ti] + track.nx[ti] * off,
        z: track.z[ti] + track.nz[ti] * off,
        h: Math.atan2(track.tx[ti], track.tz[ti]),
        vx: 0, vz: 0, speed: 0, slip: 0, steer: 0, yawRate: 0, accel: 0,
        ti, lat: off, lap: -1, rank: k + 1, wrongWay: 0,
        hp: e.stats.hp, boost: 0, nitro: 0, nitroOn: false, drifting: false,
        sec: e.sec, secAmmo: e.sec.ammo, gun: e.gun, assist: !!e.assist, assistK: 0, assistLift: 0, charge: 0, firePrev: false,
        jam: 0, jamT: 0, jamEvery: 0.5, jamDir: 1, beam: 0, beamT: 0, beamLen: [], beamHitAt: [],
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

  /** Bedny: po trati v řadách po třech (na volné ploše v mřížce kolem startu). */
  private placePickups() {
    const tr = this.track;
    if (tr.def.open) {
      const kinds: PickupKind[] = ['rocket', 'repair', 'nitro'];
      const [cx, cz] = [tr.x[0], tr.z[0]];
      let k = 0;
      for (let gx = -4; gx <= 4; gx++) {
        for (let gz = -4; gz <= 4; gz++) {
          this.pickups.push({ x: cx + gx * 90, z: cz + gz * 90, kind: kinds[k++ % kinds.length], cooldown: 0, id: this.nextId++ });
        }
        k++;
      }
      return;
    }
    const rows = Math.max(6, Math.round(tr.length / 150));
    const kinds: PickupKind[] = ['rocket', 'repair', 'nitro'];
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
      let humans = 0, humansDone = 0, anyFinished = false;
      for (const c of this.cars) {
        if (c.human) { humans++; if (c.finished) humansDone++; }
        if (c.finished) anyFinished = true;
      }
      const timeout = this.firstHumanFinish >= 0 && this.time - this.firstHumanFinish > 30;
      if ((humans > 0 && humansDone === humans) || timeout || (humans === 0 && anyFinished)) this.endRace();
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
    if (this.track.def.open) {
      for (const c of this.cars) c.speedScale = c.human ? 1 : c.ai.skill;
      return;
    }
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
    const buf = this.rankBuf;
    buf.length = 0;
    for (const c of this.cars) buf.push(c);
    if (this.track.def.open) {
      // volná jízda: pořadí podle zničených aut (při shodě rozhoduje, kdo míň umíral)
      buf.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
    } else {
      buf.sort((a, b) => {
        if (a.finished && b.finished) return a.place - b.place;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return this.progress(b) - this.progress(a);
      });
    }
    for (let i = 0; i < buf.length; i++) buf[i].rank = i + 1;
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
    let steerIn = clamp(inp.steer, -1, 1);
    // EMP: auto chvíli neposlouchá hráče, ale náhodné šipky (každá drží `jamEvery` sekund)
    if (c.jam > 0) {
      c.jam -= dt;
      c.jamT -= dt;
      if (c.jamT <= 0) { c.jamT = c.jamEvery; c.jamDir = this.rnd() < 0.5 ? -1 : 1; }
      steerIn = c.jamDir;
    }
    // Volant: u tlačítek se do zatáčky otáčí pomaleji a zpět rychleji (tlačítko dává jen -1/0/1,
    // rampa tedy dělá plynulost za hráče). Náklon telefonu je plynulý sám, tak se jen mírně
    // tlumí skoky po ztraceném paketu – jinak by rampa přidala až dvě desetiny vteřiny zpoždění.
    const sr = c.analog ? 24 : Math.abs(steerIn) < Math.abs(c.steer) || steerIn * c.steer < 0 ? 8 : 5;
    c.steer = approach(c.steer, steerIn, sr * dt);

    let fx = Math.sin(c.h), fz = Math.cos(c.h);
    let vf = c.vx * fx + c.vz * fz;

    // zrychlení z modré bedny – žádné tlačítko, prostě běží, dokud nevyprší
    c.boost = Math.max(0, c.boost - dt);
    c.nitroOn = c.boost > 0;
    c.nitro = c.boost / BOOST_TIME;
    let throttle = clamp(inp.throttle, 0, 1);
    let brake = clamp(inp.brake, 0, 1);
    // BRAKE ASSIST (cheat): komu je zapnutý, tomu se auto samo přibrzdí před zatáčkou.
    // Drift je úmysl a rušení z EMP je zbraň – do obojího asistent nemluví.
    if (c.assist && !inp.drift && c.jam <= 0) this.brakeAssist(c, dt);
    else { c.assistK = approach(c.assistK, 0, 5 * dt); c.assistLift = 0; }
    if (c.assistK > 0) brake = Math.max(brake, c.assistK);
    if (c.assistLift > 0) throttle = Math.min(throttle, 1 - c.assistLift);

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
      // s vypnutým motorem brzda jen brzdí – couvat se nedá
      else if (throttle < 0.1 && !c.engineOff) a -= 15 * brake * (1 + Math.max(-1, vf / 16)); // zpátečka do ~16 m/s
      else if (c.engineOff && vf < 0) a += st.brake * brake;
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

    if (!tr.def.open) {
      this.lapCheck(c, prev);
      // protisměr
      const along = fx * tr.tx[c.ti] + fz * tr.tz[c.ti];
      if (along < -0.3 && vf > 4) c.wrongWay += dt; else c.wrongWay = 0;
    }

    // zbraně
    if (!c.finished && this.phase === 'racing') {
      if (c.gun.kind === 'beam') this.stepCharge(c, inp.fire, dt);
      else if (c.gun.kind === 'emp') this.stepEmp(c, inp.fire && !c.firePrev, dt);
      else if (inp.fire && c.fireCd <= 0) this.fireGun(c);
      if (inp.secondary && c.secCd <= 0 && c.secAmmo > 0) this.fireSecondary(c);
    } else if (c.gun.kind !== 'bullet') {
      c.charge = 0;
    }
    c.firePrev = inp.fire;
  }

  /**
   * EMP: vysílač se dobíjí sám od startu závodu a jakmile je plný,
   * ťuknutím na FIRE 1 se vlna odpálí. Nedonabitý náboj se vystřelit nedá.
   */
  private stepEmp(c: Car, pressed: boolean, dt: number) {
    const g = c.gun;
    const full = g.chargeMax ?? 5;
    if (c.fireCd > 0) return;
    if (c.charge < full) {
      // vysílač se dobíjí sám, pořád – hráč jen čeká, až bude plno
      c.charge = Math.min(full, c.charge + dt);
      if (c.charge >= full && c.human) this.events.push({ t: 'charge', car: c.id }); // pípne, že je nabito
      return;
    }
    // nabito – čeká se na odpálení; bot pálí, až má koho zasáhnout
    if (pressed || (!c.human && this.someoneNear(c, g.range * 0.75))) this.fireWave(c);
  }

  /**
   * BRAKE ASSIST: o kolik asistent přibrzdí a ubere plyn (zapíše do `c.assistK` / `c.assistLift`).
   *
   * Tři vrstvy, vždy se bere ta nejpřísnější:
   *  1. **Zatáčka před autem** – projde křivost trati až do vzdálenosti, ze které se auto ještě
   *     ubrzdí, a pro každé místo spočítá, jakou rychlostí se tam dá projet (boční přilnavost +
   *     jak ostře auto vůbec umí zatočit, a to po širší stopě, protože trať není nitka).
   *     Pak se ptá obráceně, než je zvykem: *kdybych od teď brzdil / jen pustil plyn, kolik tam
   *     doveze?* Brzdná dráha počítá i s odporem vzduchu, takže sedí i v nitru.
   *  2. **Jen pustit plyn** – když na zatáčku stačí dojet setrvačností, asistent nebrzdí vůbec,
   *     jen ubere plyn. Většina mírných zatáček se tím vyřídí, aniž by to hráč poznal.
   *  3. **"Tohle už nevytočím"** – dopředu si přehraje, kam auto dojede, i kdyby hned zatočilo
   *     na doraz. Když ani tak neudrží trať, brzdí podle toho, jak moc by ji přejelo. Tahle
   *     vrstva chytá to, co osa trati nevidí: špatný nájezd, odhození po zásahu nebo smyk.
   *
   * Výsledek se hladí – nasazuje rychle, pouští pozvolna – takže auto nekubne a hráč má pořád
   * pocit, že řídí on. Do driftu ani do rušení z EMP asistent nemluví a na volné ploše nedělá nic.
   */
  private brakeAssist(c: Car, dt: number) {
    const tr = this.track;
    const st = c.stats;
    const v = c.speed;
    if (tr.def.open || v < 12) {
      c.assistK = approach(c.assistK, 0, 5 * dt);
      c.assistLift = 0;
      return;
    }
    // zpomalení je rychlostí závislé (odpor vzduchu): na úseku v→vmax stačí vzít průměr
    const brakeDec = (vmax: number) => st.brake + 0.05 * (v + vmax);
    const coastDec = (vmax: number) => 2.2 + 0.05 * (v + vmax);

    // trať je široká – zatáčka jde projet po mírnějším oblouku, než má osa
    const useW = Math.max(0, tr.wallDist - 2.6) * 0.9;
    const aLat = 5.4 * st.grip;
    // kouká se přesně tak daleko, kolik je brzdná dráha (+ kousek na reakci)
    const scan = Math.min(260, Math.round((v * v / (2 * (st.brake + 0.1 * v)) + 16) / tr.step));
    let wantBrake = 0, wantLift = 0;
    for (let j = 1; j <= scan; j++) {
      const k0 = Math.abs(tr.curv[wrapIdx(tr, c.ti + j)]);
      if (k0 < 0.0035) continue;
      const k = 1 / (1 / k0 + useW);
      const vmax = Math.min(Math.sqrt(aLat / k), maxCornerSpeed(st, k));
      if (vmax >= v) continue;
      const d = Math.max(0, j * tr.step - 3); // rezerva, ať se nebrzdí na poslední chvíli
      const vb = Math.sqrt(Math.max(0, v * v - 2 * brakeDec(vmax) * d));
      const vc = Math.sqrt(Math.max(0, v * v - 2 * coastDec(vmax) * d));
      // mírnou zatáčku vyřídí pouhé puštění plynu – ale až když je blízko, ať se nejede na půl plynu zbytečně
      if (vc > vmax + 0.8 && j * tr.step < 45) wantLift = Math.max(wantLift, clamp((vc - vmax) / 6, 0, 0.6));
      if (vb > vmax + 0.4) wantBrake = Math.max(wantBrake, clamp((vb - vmax) / 7, 0.12, 1));
      if (wantBrake >= 1) break; // silněji už brzdit nejde, zbytek zatáček nemá cenu počítat
    }
    wantBrake = Math.max(wantBrake, this.escapeRisk(c));

    // nasadit svižně, pustit pozvolna – jinak by to v zatáčce cukalo
    c.assistK = approach(c.assistK, wantBrake, (wantBrake > c.assistK ? 9 : 3.5) * dt);
    if (c.assistK < 0.02) c.assistK = 0;
    c.assistLift = Math.max(wantLift, c.assistK);
  }

  /**
   * "Vytočím to ještě?" Spočítá, jak ostrý oblouk by auto teď muselo opsat, aby se vrátilo na
   * stopu (míří na bod kus před sebou po ose trati), a porovná to s tím, jak ostře vůbec umí
   * při téhle rychlosti zatočit. Když na to nemá, vrací 0–1 podle toho, jak moc mu to chybí.
   *
   * Tohle chytá situace, které křivost trati před autem nevidí: nájezd do zatáčky zevnitř ven,
   * odhození po zásahu nebo po nárazu, rozjetý zadek.
   */
  private escapeRisk(c: Car): number {
    const tr = this.track;
    const v = c.speed;
    const kCap = yawAt(c.stats, v) / v; // nejostřejší oblouk, na který auto při téhle rychlosti má
    if (kCap <= 0) return 0;
    const L = clamp(v * 0.62, 9, 26); // kam se dívá (m)
    const j = wrapIdx(tr, c.ti + Math.round(L / tr.step));
    const dx = tr.x[j] - c.x, dz = tr.z[j] - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) return 0;
    // úhel mezi nosem auta a spojnicí k mířenému bodu → potřebná křivost oblouku (pure pursuit)
    let a = Math.atan2(dx, dz) - c.h;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    const kNeed = (2 * Math.abs(Math.sin(a))) / d;
    const ratio = kNeed / kCap;
    return ratio <= 0.85 ? 0 : clamp((ratio - 0.85) / 0.4, 0.2, 1);
  }

  /** Je někdo v dosahu? (bot si podle toho načasuje EMP) */
  private someoneNear(c: Car, r: number): boolean {
    const r2 = r * r;
    for (const o of this.cars) {
      if (o === c || o.dead || o.finished) continue;
      if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 < r2) return true;
    }
    return false;
  }

  private fireWave(c: Car) {
    const g = c.gun;
    c.charge = 0;
    c.fireCd = g.cd;
    this.waves.push({ owner: c.id, x: c.x, z: c.z, t: 0, r: 0, gun: g, hit: [], id: this.nextId++ });
    this.events.push({ t: 'wave', car: c.id, x: c.x, z: c.z });
  }

  /** Vlny: roztahují se z místa výstřelu a koho poprvé přejdou, tomu dají ránu a zblázní volant. */
  private stepWaves(dt: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const g = w.gun;
      const span = g.waveTime ?? 0.55;
      w.t += dt;
      w.r = Math.min(g.range, (w.t / span) * g.range);
      for (const c of this.cars) {
        if (c.id === w.owner || c.dead || c.finished || w.hit.includes(c.id)) continue;
        if ((c.x - w.x) ** 2 + (c.z - w.z) ** 2 > w.r * w.r) continue;
        w.hit.push(c.id);
        // každé zasažené auto má šanci, že ho vlna rovnou roztrhá; jinak jen schytá ránu
        if (g.kill && this.rnd() < g.kill) this.damage(c, 1e4, w.owner);
        else this.damage(c, g.dmg, w.owner);
        if (c.dead) continue;
        c.jamEvery = g.jamStep ?? 0.5;
        c.jam = (g.jam ?? 3) * c.jamEvery;
        c.jamT = 0;                       // první šipka se vylosuje hned
        this.events.push({ t: 'jammed', car: c.id });
      }
      if (w.t >= span) this.waves.splice(i, 1);
    }
  }

  /** Projelo auto cílem? (prev = index vzorku trati před posunem) */
  private lapCheck(c: Car, prev: number) {
    if (this.track.def.open) return; // volná jízda: žádný cíl, žádná kola
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
    if (tr.def.open) return; // volná jízda: žádná svodidla ani hranice, plac nikde nekončí
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
    c.beamLen = this.beamSides(c).map(() => c.gun.range); // jen při výstřelu, ne každý snímek
    c.beamHitAt = [];
    c.charge = 0;
    this.events.push({ t: 'beam', car: c.id, len: c.beamT });
  }

  /** Z kolika míst auto pálí: dvojitá zbraň zleva i zprava, jinak jen ze středu. */
  private beamSides(c: Car): readonly number[] {
    return c.gun.twin ? BEAM_TWIN : BEAM_SINGLE;
  }

  /**
   * Paprsky: pálí rovně dopředu z míst, kde zbraň na autě sedí (u PRISM z obou dveří),
   * a každý si najde první auto v cestě.
   *
   * Zásah je **jednorázová rána**, ne ubírání po kapkách: stačí po někom paprskem řeznout
   * a schytá celé `g.dmg` naráz. Dokud paprsek na autě drží, další rána přijde až za
   * `g.rehit` sekund – a protože se počítá za auto (ne za paprsek), obě děla dohromady
   * nenapočítají dvojnásobek.
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
      const reach = g.beamR ?? 0.55;
      this.beamSides(c).forEach((sgn, k) => {
        const ox = c.x + fx * fwd - fz * lat * sgn, oz = c.z + fz * fwd + fx * lat * sgn;
        let hit: Car | null = null, hitT = g.range;
        for (const o of this.cars) {
          if (o === c || o.dead || o.finished) continue;
          const dx = o.x - ox, dz = o.z - oz;
          const t = dx * fx + dz * fz;                    // jak daleko podél paprsku
          if (t < 0 || t > hitT) continue;
          // kolmá odchylka: počítá se od boku auta, ne od jeho středu, ať se dá i "štrejchnout"
          if (Math.abs(dx * fz - dz * fx) > reach + CAR_R) continue;
          hit = o; hitT = t;
        }
        c.beamLen[k] = hitT;
        if (!hit) return;
        const last = c.beamHitAt[hit.id] ?? -99;
        if (this.time - last < (g.rehit ?? 0.7)) return;  // tohle auto už ránu dostalo
        c.beamHitAt[hit.id] = this.time;
        // AI pálí do lidí slabším paprskem, ať to není frustrující
        this.damage(hit, g.dmg * (!c.human && hit.human ? 0.55 : 1), c.id);
        this.events.push({ t: 'hit', car: hit.id, x: ox + fx * hitT, z: oz + fz * hitT });
      });
    }
  }

  private fireSecondary(c: Car) {
    const g = c.sec;
    c.secAmmo--;
    c.secCd = g.cd;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    if (g.id === 'hook') {
      // hák letí z vrhače na pravé straně kapoty; ve vzduchu může být jen jeden
      const i = this.hooks.findIndex((h) => h.owner === c.id);
      if (i >= 0) this.hooks.splice(i, 1);
      const o = hookMuzzle(c);
      const sp = g.hookSpeed ?? 120;
      // vrhač si cíl doměří: zamíří tam, kde cíl bude, až tam hák doletí
      let dir = c.h;
      const tgt = this.findTarget(c, g.cone ?? 0.4, g.hookRange ?? 95);
      if (tgt) {
        const lead = interceptDir(o.x, o.z, tgt, sp);
        const max = g.aimMax ?? 0.5;
        if (lead !== null) dir = c.h + clamp(angDiff(lead, c.h), -max, max);
      }
      this.hooks.push({
        owner: c.id, target: -1, x: o.x, z: o.z, vx: Math.sin(dir) * sp, vz: Math.cos(dir) * sp,
        state: 'fly', flown: 0, t: g.hold ?? 2.4, def: g, id: this.nextId++,
      });
    } else if (g.id === 'mine' || g.id === 'ball') {
      // pouští se kousek za zadní nárazník; chvíli se to natahuje, ať si to auto nehodí pod sebe
      const back = c.stats.shape.length / 2 + 0.9;
      const n = g.count ?? 1;
      const spread = g.spread ?? 0;
      for (let i = 0; i < n; i++) {
        if (this.drops.length >= MAX_DROPS) this.drops.shift();
        // míčky letí do vějíře dozadu a berou si kus rychlosti auta, ať se kutálí dál
        const a = spread ? c.h + Math.PI + (i / n - 0.5) * 2.2 + (this.rnd() - 0.5) * 0.5 : 0;
        const sp = spread ? spread * (0.55 + this.rnd() * 0.75) : 0;
        this.drops.push({
          x: c.x - fx * back, z: c.z - fz * back, y: spread ? 0.45 : 0,
          vx: spread ? Math.sin(a) * sp + c.vx * 0.3 : 0,
          vz: spread ? Math.cos(a) * sp + c.vz * 0.3 : 0,
          vy: spread ? 1.4 + this.rnd() * 2.2 : 0,
          roll: 0, yaw: a,
          owner: c.id, arm: g.arm ?? 0.8, life: g.life ?? 30, fuse: -1, def: g, id: this.nextId++,
        });
      }
    } else {
      const tgt = this.findTarget(c, 0.5, 130);
      this.rockets.push({
        x: c.x + fx * 2, z: c.z + fz * 2, h: c.h, speed: Math.max(35, c.speed + 25),
        life: 3.2, owner: c.id, target: tgt ? tgt.id : -1, ti: c.ti, id: this.nextId++,
      });
    }
    this.events.push({ t: 'launch', car: c.id, kind: g.id });
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
      if (!gone && !tr.def.open) {
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
      if (!boom && !tr.def.open) {
        r.ti = locate(tr, r.x, r.z, r.ti, 5);
        if (Math.abs(lateral(tr, r.ti, r.x, r.z)) > tr.wallDist - 0.2) boom = true;
      }
      if (boom) {
        const g = this.cars[r.owner]?.sec;
        this.explode(r.x, r.z, g?.radius ?? 8.5, g?.dmg ?? 58, r.owner);
        this.rockets.splice(i, 1);
      }
    }
    this.stepDrops(dt);
    this.stepHooks(dt);
    this.stepWaves(dt);
  }

  /**
   * Háky: let dopředu, zaháknutí do nejbližšího cizího auta a pak tah po laně.
   * Tah se přičítá k rychlosti až po kroku auta, aby ho nesnědla boční přilnavost –
   * auto se po laně doopravdy rozjede, místo aby jen zaskřípělo na místě.
   */
  private stepHooks(dt: number) {
    for (let i = this.hooks.length - 1; i >= 0; i--) {
      const h = this.hooks[i];
      const me = this.cars[h.owner];
      const g = h.def;
      if (!me || me.dead || me.finished) { this.hooks.splice(i, 1); continue; }
      const o = hookMuzzle(me);

      if (h.state === 'fly') {
        h.x += h.vx * dt; h.z += h.vz * dt;
        h.flown += Math.hypot(h.vx, h.vz) * dt;
        const grab = (g.grab ?? 3.4) ** 2;
        for (const c of this.cars) {
          if (c.id === h.owner || c.dead || c.finished) continue;
          if ((c.x - h.x) ** 2 + (c.z - h.z) ** 2 > grab) continue;
          h.state = 'hold';
          h.target = c.id;
          this.events.push({ t: 'hooked', car: h.owner, x: h.x, z: h.z });
          break;
        }
        if (h.state === 'fly' && h.flown > (g.hookRange ?? 95)) h.state = 'back';
      } else if (h.state === 'hold') {
        const tgt = this.cars[h.target];
        if (!tgt || tgt.dead || tgt.finished) { h.state = 'back'; continue; }
        h.x = tgt.x; h.z = tgt.z;
        const dx = tgt.x - me.x, dz = tgt.z - me.z;
        const d = Math.hypot(dx, dz) || 1;
        h.t -= dt;
        // lano povolí, když jsme u sebe, vyprší čas nebo se soupeř utrhne za dostřel
        if (h.t <= 0 || d < 5.5 || d > (g.hookRange ?? 95) * 1.25) { h.state = 'back'; continue; }
        const ux = dx / d, uz = dz / d;
        const pull = g.pull ?? 30;
        me.vx += ux * pull * dt; me.vz += uz * pull * dt;
        // lano táhne i druhou stranu, jen slaběji – soupeř cítí, že ho někdo drží
        tgt.vx -= ux * pull * 0.22 * dt; tgt.vz -= uz * pull * 0.22 * dt;
        // a stáčí nos střelce po laně, ať ho to netáhne bokem
        const da = angDiff(Math.atan2(ux, uz), me.h);
        me.h += clamp(da, -1.6 * dt, 1.6 * dt);
      } else {
        // navíjení zpátky k vrhači
        const dx = o.x - h.x, dz = o.z - h.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.5) { this.hooks.splice(i, 1); continue; }
        const sp = (g.hookSpeed ?? 120) * 1.3;
        h.x += (dx / d) * sp * dt; h.z += (dz / d) * sp * dt;
      }
    }
  }

  /**
   * Miny a míčky: natahují se, pak čekají na cizí auto. Cizí výbuch je zapálí taky (řetězová
   * reakce). Míček se navíc odráží od země a kutálí, dokud ho nezastaví tření.
   */
  private stepDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const m = this.drops[i];
      if (m.vx || m.vz || m.vy || m.y > 0) this.stepBall(m, dt);
      if (m.arm > 0) m.arm -= dt;
      m.life -= dt;
      let boom = false;
      if (m.fuse > 0) {
        m.fuse -= dt;
        boom = m.fuse <= 0;
      } else if (m.arm <= 0) {
        const r2 = (m.def.trigger ?? 2.2) ** 2;
        for (const c of this.cars) {
          if (c.dead || c.id === m.owner || c.finished) continue;
          if ((c.x - m.x) ** 2 + (c.z - m.z) ** 2 < r2) { boom = true; break; }
        }
      }
      if (!boom && m.life > 0) continue;
      // nejdřív ven ze seznamu, ať to vlastní výbuch nezapálil znovu
      this.drops[i] = this.drops[this.drops.length - 1];
      this.drops.pop();
      if (boom) this.explode(m.x, m.z, m.def.radius, m.def.dmg, m.owner);
    }
  }

  /** Let a kutálení jednoho míčku. Nic složitého: tíha, odraz od země a tření. */
  private stepBall(m: Drop, dt: number) {
    m.x += m.vx * dt; m.z += m.vz * dt;
    m.y += m.vy * dt;
    m.vy -= BALL_G * dt;
    if (m.y <= 0) {
      m.y = 0;
      if (m.vy < -0.6) m.vy = -m.vy * BALL_BOUNCE; else m.vy = 0;
      // odraz od země sebere i kus vodorovné rychlosti
      m.vx *= 0.88; m.vz *= 0.88;
    }
    const k = Math.max(0, 1 - BALL_DRAG * dt);
    m.vx *= k; m.vz *= k;
    const sp = Math.hypot(m.vx, m.vz);
    if (sp < 0.25 && m.y <= 0) { m.vx = 0; m.vz = 0; }
    else { m.roll += (sp * dt) / BALL_R; m.yaw = Math.atan2(m.vx, m.vz); }
  }

  explode(x: number, z: number, radius: number, dmg: number, owner: number) {
    this.events.push({ t: 'boom', x, z, size: radius / 8 });
    // miny a míčky v dosahu to zapálí taky – bouchnou s malým zpožděním za sebou
    for (const m of this.drops) {
      if (m.fuse < 0 && (m.x - x) ** 2 + (m.z - z) ** 2 < radius * radius) m.fuse = 0.06 + this.rnd() * 0.1;
    }
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
    if (tr.def.open) return this.respawnFree(c);
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
    c.engineOff = false;
    c.invuln = 2.5;
    c.lastHitBy = -1;
    c.ai.stuckT = 0;
    this.events.push({ t: 'respawn', car: c.id });
  }

  /** Volná jízda: auto se vrátí tam, kde skončilo – nikdo nelétá přes půlku placu. */
  private respawnFree(c: Car) {
    const a = this.rnd() * Math.PI * 2;
    let x = c.x, z = c.z;
    for (let k = 0; k < 6; k++) {
      const d = 6 + k * 4;
      x = c.x + Math.sin(a + k) * d; z = c.z + Math.cos(a + k) * d;
      if (this.cars.every((o) => o === c || o.dead || (o.x - x) ** 2 + (o.z - z) ** 2 > 30)) break;
    }
    c.x = x; c.z = z;
    c.h = a;
    c.vx = Math.sin(a) * 10; c.vz = Math.cos(a) * 10;
    c.speed = 10; c.steer = 0; c.yawRate = 0;
    c.hp = c.stats.hp;
    c.dead = false;
    c.engineOff = false; // po zničení se auto vrací nastartované
    c.invuln = 2.5;
    c.lastHitBy = -1;
    c.ai.stuckT = 0;
    c.ti = locate(this.track, c.x, c.z, c.ti, 40);
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
          // bedna s municí doplní tu sekundární zbraň, se kterou hráč jede
          c.secAmmo = Math.min(c.sec.maxAmmo, c.secAmmo + c.sec.pickup);
        }
        p.cooldown = 7;
        this.events.push({ t: 'pickup', car: c.id, kind: p.kind, x: p.x, z: p.z });
        break;
      }
    }
  }
}
