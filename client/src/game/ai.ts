/**
 * AI soupeři. Jedou po ose trati s bočním posunem ("pruh"), brzdí před zatáčkami podle křivosti,
 * vyhýbají se pomalejším autům, střílí v dávkách a umí se vyprostit ze zaseknutí.
 *
 * Na otevřené ploše (TrackDef.open) se místo trati jezdí volně: AI si drží cíl – buď nejbližší auto,
 * které loví, nebo náhodný bod kus dál – a pořád po sobě střílí.
 */
import { maxCornerSpeed, type Car, type Sim } from './sim';
import { wrapIdx } from './track';

export interface AIState {
  skill: number;
  lane: number;
  laneT: number;
  spread: number;
  stuckT: number;
  stuckCount: number;
  reverseT: number;
  burstT: number;
  pause: number;
  secT: number;
  /** volná jízda: cíl, ke kterému se teď jede, a kolik času mu ještě zbývá */
  roamX: number;
  roamZ: number;
  roamT: number;
  /** jak ochotně se pouští do honičky (0.5–1) */
  hunt: number;
}

export function newAI(rnd: () => number, skill: number): AIState {
  return {
    skill: skill * (0.96 + rnd() * 0.06),
    lane: 0,
    laneT: 0,
    spread: 0.03 + rnd() * 0.03,
    stuckT: 0,
    stuckCount: 0,
    reverseT: 0,
    burstT: 0,
    pause: 0.7 + rnd() * 1.0,
    secT: 3 + rnd() * 5,
    roamX: 0,
    roamZ: 0,
    roamT: 0,
    hunt: 0.5 + rnd() * 0.5,
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function aiThink(sim: Sim, c: Car, dt: number) {
  const tr = sim.track, ai = c.ai, inp = c.input;
  if (c.dead) {
    inp.steer = 0; inp.throttle = 0; inp.brake = 0; inp.fire = false; inp.secondary = false; inp.drift = false;
    return;
  }
  const cruising = c.finished;
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  if (tr.def.open) { aiRoam(sim, c, dt, fx, fz); return; }

  // --- volba pruhu
  ai.laneT -= dt;
  if (ai.laneT <= 0) {
    ai.laneT = 2 + sim.rnd() * 4;
    ai.lane = (sim.rnd() * 2 - 1) * tr.halfWidth * 0.6;
  }
  let lane = ai.lane;
  // vyhni se pomalejšímu autu / vraku před sebou
  let block = Infinity;
  for (const o of sim.cars) {
    if (o === c) continue;
    const dx = o.x - c.x, dz = o.z - c.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 2 || ahead > 26 || ahead > block) continue;
    if (Math.abs(o.lat - c.lat) < 2.8 && (o.dead || o.speed < c.speed - 1)) {
      block = ahead;
      lane = o.lat + (o.lat > 0 ? -4.6 : 4.6);
    }
  }
  lane = clamp(lane, -(tr.halfWidth - 1.8), tr.halfWidth - 1.8);

  // --- řízení: miř na bod kus před sebou
  const la = 9 + Math.abs(c.speed) * 0.42;
  const i2 = wrapIdx(tr, c.ti + Math.round(la / tr.step));
  const px = tr.x[i2] + tr.nx[i2] * lane, pz = tr.z[i2] + tr.nz[i2] * lane;
  const diff = angDiff(Math.atan2(px - c.x, pz - c.z), c.h); // kladné = cíl je vlevo
  let steer = clamp(-diff * 2.8, -1, 1);

  // --- rychlost: projdi křivost před sebou a spočítej, jak rychle se dá ještě ubrzdit
  let target = c.stats.top * 1.5;
  const aLat = 4.2 * c.stats.grip * ai.skill; // kolik bočního zrychlení si AI dovolí (arkádově hodně)
  const dec = c.stats.brake * 0.75;
  const K = Math.round((24 + Math.abs(c.speed) * 2.2) / tr.step);
  for (let j = 1; j < K; j += 2) {
    const k = Math.abs(tr.curv[wrapIdx(tr, c.ti + j)]);
    if (k < 0.004) continue;
    // auto musí zatáčku jednak udržet (přilnavost), jednak do ní vůbec stihnout zatočit
    const vmax = Math.min(Math.sqrt(aLat / k), maxCornerSpeed(c.stats, k) * 0.94);
    const allow = Math.sqrt(vmax * vmax + 2 * dec * j * tr.step);
    if (allow < target) target = allow;
  }
  if (cruising) target = Math.min(target, 32);
  let throttle = c.speed < target ? 1 : 0;
  let brake = c.speed > target + 2 ? clamp((c.speed - target) / 8, 0.25, 1) : 0;
  if (Math.abs(diff) > 0.9 && c.speed > 12) throttle = 0.4;

  // --- vyproštění
  if (Math.abs(c.speed) < 2.5 && sim.time > 1.5) ai.stuckT += dt;
  else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (c.speed > 20) ai.stuckCount = 0;
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    throttle = 0; brake = 1; steer = -steer;
  } else if (ai.stuckT > 1.1) {
    ai.stuckT = 0;
    if (++ai.stuckCount >= 3) { ai.stuckCount = 0; sim.respawn(c); }
    else ai.reverseT = 0.9;
  }

  // --- zbraně
  let fire = false, sec = false;
  if (!cruising && sim.phase === 'racing' && sim.time > 3) {
    ai.burstT -= dt;
    if (sim.findTarget(c, 0.13, 70)) {
      if (ai.burstT < -ai.pause) ai.burstT = 0.4 + sim.rnd() * 0.8;
      fire = ai.burstT > 0;
    }
    ai.secT -= dt;
    if (c.secAmmo > 0 && ai.secT <= 0 && wantSecondary(sim, c, 0.22, 90)) {
      sec = true;
      ai.secT = secPause(sim, c);
    }
  }

  inp.steer = steer; inp.throttle = throttle; inp.brake = brake;
  inp.fire = fire; inp.secondary = sec; inp.drift = false;
}

/**
 * Volná jízda na otevřeném placu: žádná trať, jen cíl a plyn.
 * Nejbližší auto do 220 m se loví, jinak se jede k náhodnému bodu; po cestě se střílí.
 */
function aiRoam(sim: Sim, c: Car, dt: number, fx: number, fz: number) {
  const ai = c.ai, inp = c.input;

  // --- koho honit
  let prey: Car | null = null, pd = Infinity;
  for (const o of sim.cars) {
    if (o === c || o.dead) continue;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    // lidi jsou lákavější cíl, ať je o zábavu postaráno
    const w = d * (o.human ? 0.7 : 1);
    if (w < pd) { pd = w; prey = o; }
  }
  ai.roamT -= dt;
  if (ai.roamT <= 0 || (ai.roamX === 0 && ai.roamZ === 0)) {
    // nový bod kus dál – plac je nekonečný, tak se jezdí po okolí, ne po kolečku
    const a = sim.rnd() * Math.PI * 2, r = 260 + sim.rnd() * 520;
    ai.roamX = c.x + Math.sin(a) * r; ai.roamZ = c.z + Math.cos(a) * r;
    ai.roamT = 10 + sim.rnd() * 12;
  }
  const chase = !!prey && pd < 90 * ai.hunt + 45 && sim.phase === 'racing';
  let tx = chase ? prey!.x : ai.roamX, tz = chase ? prey!.z : ai.roamZ;
  if (chase && prey) {
    // mir trochu před něj, ať nejede pořád do jeho stopy
    const lead = Math.min(1.2, pd / 60);
    tx += prey.vx * lead; tz += prey.vz * lead;
  }
  if (!chase && Math.hypot(tx - c.x, tz - c.z) < 30) ai.roamT = 0;

  // --- vyhni se autu těsně před sebou (ať se do sebe pořád nezaklesnou)
  let dodge = 0;
  for (const o of sim.cars) {
    if (o === c) continue;
    const dx = o.x - c.x, dz = o.z - c.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 1.5 || ahead > 16) continue;
    const side = dz * fx - dx * fz;
    if (Math.abs(side) < 3 && (o.dead || o.speed < c.speed - 6)) dodge = side > 0 ? -0.55 : 0.55;
  }

  const diff = angDiff(Math.atan2(tx - c.x, tz - c.z), c.h);
  let steer = clamp(-diff * 2.4 + dodge, -1, 1);

  // --- plyn: naplno, v ostré zatáčce ubrat, na couvání při cíli za zády
  const turn = Math.abs(diff);
  let target = c.stats.top * (chase ? 1.5 : 1.1) * ai.skill;
  if (turn > 1.1) target = Math.min(target, 22);
  else if (turn > 0.6) target = Math.min(target, 38);
  if (chase && pd < 12) target = Math.min(target, prey ? Math.abs(prey.speed) + 8 : target);
  let throttle = c.speed < target ? 1 : 0;
  let brake = c.speed > target + 3 ? clamp((c.speed - target) / 10, 0.25, 1) : 0;

  // --- vyproštění
  if (Math.abs(c.speed) < 2.5 && sim.time > 1.5) ai.stuckT += dt;
  else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (c.speed > 20) ai.stuckCount = 0;
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    throttle = 0; brake = 1; steer = -steer;
  } else if (ai.stuckT > 1.1) {
    ai.stuckT = 0;
    ai.roamT = 0;
    if (++ai.stuckCount >= 3) { ai.stuckCount = 0; sim.respawn(c); }
    else ai.reverseT = 0.9;
  }

  // --- zbraně
  let fire = false, sec = false;
  if (sim.phase === 'racing' && sim.time > 3) {
    ai.burstT -= dt;
    if (sim.findTarget(c, 0.16, 85)) {
      if (ai.burstT < -ai.pause) ai.burstT = 0.5 + sim.rnd() * 0.9;
      fire = ai.burstT > 0;
    }
    ai.secT -= dt;
    if (c.secAmmo > 0 && ai.secT <= 0 && wantSecondary(sim, c, 0.24, 110)) {
      sec = true;
      ai.secT = secPause(sim, c);
    }
  }

  inp.steer = steer; inp.throttle = throttle; inp.brake = brake;
  inp.fire = fire; inp.secondary = sec; inp.drift = false;
}

/**
 * Má AI zmáčknout FIRE 2? Raketa se pouští na cíl vepředu, hák na toho, kdo ujíždí
 * (a je dost daleko, aby mělo smysl se přitáhnout), mina a míčky naopak tomu,
 * kdo sedí vzadu na nárazníku – jinak by je jen rozsypala do prázdna.
 */
function wantSecondary(sim: Sim, c: Car, cone: number, range: number): boolean {
  if (c.sec.id === 'mine' || c.sec.id === 'ball') return tailgater(sim, c, 34);
  if (c.sec.id === 'hook') {
    if (sim.hooks.some((h) => h.owner === c.id)) return false;   // jeden už lítá
    const t = sim.findTarget(c, 0.1, c.sec.hookRange ?? 62);
    return !!t && Math.hypot(t.x - c.x, t.z - c.z) > 12;
  }
  const t = sim.findTarget(c, cone, range);
  return !!t && Math.hypot(t.x - c.x, t.z - c.z) > 14;
}

/** Jak dlouho počkat do dalšího použití – miny a míčky se dají sypat, raket a háků je málo. */
function secPause(sim: Sim, c: Car): number {
  if (c.sec.id === 'rocket') return 3 + sim.rnd() * 5;
  if (c.sec.id === 'hook') return 2.5 + sim.rnd() * 3.5;
  return 1.2 + sim.rnd() * 2.4;
}

/** Jede někdo za mnou (v kuželu dozadu, do `dist` metrů)? */
function tailgater(sim: Sim, c: Car, dist: number): boolean {
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  for (const o of sim.cars) {
    if (o === c || o.dead || o.finished) continue;
    const dx = o.x - c.x, dz = o.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > dist || d < 2) continue;
    if ((dx * fx + dz * fz) / d < -0.55) return true;
  }
  return false;
}
