/**
 * AI soupeři. Jedou po ose trati s bočním posunem ("pruh"), brzdí před zatáčkami podle křivosti,
 * vyhýbají se pomalejším autům, střílí v dávkách a umí se vyprostit ze zaseknutí.
 */
import type { Car, Sim } from './sim';
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

  // --- volba pruhu
  ai.laneT -= dt;
  if (ai.laneT <= 0) {
    ai.laneT = 2 + sim.rnd() * 4;
    ai.lane = (sim.rnd() * 2 - 1) * tr.halfWidth * 0.6;
  }
  let lane = ai.lane;
  // vyhni se pomalejšímu autu / vraku / mině před sebou
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
  for (const m of sim.mines) {
    const dx = m.x - c.x, dz = m.z - c.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 2 || ahead > 30 || ahead > block) continue;
    const side = dz * fx - dx * fz; // kladné = mina je vlevo
    if (Math.abs(side) < 2.6) {
      block = ahead;
      lane = c.lat + (side > 0 ? -4.2 : 4.2);
      if (Math.abs(lane) > tr.halfWidth - 1.8) lane = c.lat + (side > 0 ? 4.2 : -4.2);
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
  const aLat = 3.6 * c.stats.grip * ai.skill;
  const dec = c.stats.brake * 0.75;
  const K = Math.round((24 + Math.abs(c.speed) * 2.2) / tr.step);
  for (let j = 1; j < K; j += 2) {
    const k = Math.abs(tr.curv[wrapIdx(tr, c.ti + j)]);
    if (k < 0.004) continue;
    const vmax = Math.sqrt(aLat / k);
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
    if (c.secAmmo > 0 && ai.secT <= 0) {
      if (c.secType === 'rocket') {
        const t = sim.findTarget(c, 0.22, 90);
        if (t && Math.hypot(t.x - c.x, t.z - c.z) > 14) { sec = true; ai.secT = 3 + sim.rnd() * 5; }
      } else {
        for (const o of sim.cars) {
          if (o === c || o.dead) continue;
          const behind = -((o.x - c.x) * fx + (o.z - c.z) * fz);
          if (behind > 5 && behind < 28 && Math.abs(o.lat - c.lat) < 4) { sec = true; ai.secT = 3 + sim.rnd() * 5; break; }
        }
      }
    }
  }

  inp.steer = steer; inp.throttle = throttle; inp.brake = brake;
  inp.fire = fire; inp.secondary = sec; inp.drift = false;
}
