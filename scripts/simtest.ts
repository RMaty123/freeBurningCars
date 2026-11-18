/**
 * Headless test simulace (bez grafiky): na každé trati odjede závod 6 aut řízených AI
 * a zkontroluje, že auta dojedou, nikde se nezaseknou a ve stavu nejsou NaN.
 *
 *   npm run test:sim
 */
import { buildTrack } from '../client/src/game/track';
import { TRACKS } from '../client/src/game/content/tracks';
import { CAR_TYPES } from '../client/src/game/content/cars';
import { GUNS } from '../client/src/game/content/guns';
import { Sim, CarEntry } from '../client/src/game/sim';
import { aiThink } from '../client/src/game/ai';

let failed = false;
let offset = 0;
const fail = (msg: string) => { failed = true; console.log('  ✗ ' + msg); };

for (const def of TRACKS) {
  for (const withHuman of [false, true]) {
    const track = buildTrack(def);
    const entries: CarEntry[] = [];
    for (let i = 0; i < 6; i++) {
      // napříč závody se protočí všechny typy aut, ať se každé někdy projede
      const t = (i + offset) % CAR_TYPES.length;
      // zbraně se střídají taky, ať se v testu projede kulomet i laser
      entries.push({
        name: 'AI' + i, color: CAR_TYPES[t].color, tagColor: CAR_TYPES[t].color, typeIdx: t, stats: CAR_TYPES[t],
        gun: GUNS[(i + offset) % GUNS.length], human: withHuman && i === 0, pid: null,
      });
    }
    offset += 6;
    const sim = new Sim(track, entries, { laps: 3, seed: 1234 + def.id.length });
    const dt = 1 / 60;
    const count: Record<string, number> = {};
    // na otevřeném placu se nejezdí na kola – jede se 120 s volné jízdy a kouká se, jestli se něco děje
    const free = !!def.open;
    const limit = free ? 60 * 120 : 60 * 400;
    const start = sim.cars.map((c) => [c.x, c.z] as [number, number]);
    const driven = sim.cars.map(() => 0);
    const farFromStart = sim.cars.map(() => 0);
    const prevPos = sim.cars.map((c) => [c.x, c.z] as [number, number]);
    let steps = 0, maxSpeed = 0;
    while ((free || sim.phase !== 'over') && steps < limit) {
      // "člověka" v testu řídí taky AI – ověří se tím cesty kódu pro lidské hráče
      for (const c of sim.cars) if (c.human && !c.finished) aiThink(sim, c, dt);
      sim.step(dt);
      steps++;
      for (const e of sim.events) count[e.t] = (count[e.t] ?? 0) + 1;
      sim.events.length = 0;
      if (free) sim.cars.forEach((c, i) => {
        const d = Math.hypot(c.x - prevPos[i][0], c.z - prevPos[i][1]);
        if (d < 30) driven[i] += d; // skok = respawn, ten se nepočítá
        prevPos[i] = [c.x, c.z];
        farFromStart[i] = Math.max(farFromStart[i], Math.hypot(c.x - start[i][0], c.z - start[i][1]));
      });
      for (const c of sim.cars) {
        if (!Number.isFinite(c.x + c.z + c.h + c.vx + c.vz + c.hp)) { fail(`NaN ve stavu auta ${c.name}`); steps = 1e9; break; }
        if (!track.def.open && Math.abs(c.lat) > track.wallDist + 0.5) fail(`auto ${c.name} je mimo trať (lat ${c.lat.toFixed(1)})`);
        maxSpeed = Math.max(maxSpeed, c.speed);
      }
    }
    console.log(`\n${def.name} ${withHuman ? '(s "člověkem")' : '(jen AI)'} – ${track.length.toFixed(0)} m, čas závodu ${sim.time.toFixed(1)} s`);
    const res = [...sim.cars].sort((a, b) => a.place - b.place);
    for (const c of res) {
      console.log(`  ${c.place}. ${c.name.padEnd(4)} ${c.stats.name.padEnd(9)} kol ${Math.max(0, c.lap)}  nejlepší kolo ${c.bestLap.toFixed(1)} s  zničení ${c.kills}/${c.deaths}${c.human ? '  ← člověk' : ''}`);
    }
    console.log(`  události: ${Object.entries(count).map(([k, v]) => `${k}=${v}`).join(' ')}  max ${(maxSpeed * 3.6).toFixed(0)} km/h`);
    if (free) {
      // volná jízda: nikdo nesmí zůstat stát na místě a mělo by se střílet
      sim.cars.forEach((c, i) => {
        if (driven[i] < 600) fail(`auto ${c.name} se na placu skoro nehnulo (ujelo ${driven[i].toFixed(0)} m)`);
      });
      if (Math.max(...farFromStart) < 120) fail('auta se nerozjela po placu (všechna zůstala do 120 m od startu)');
      // pojistka proti bariéře: jedno auto jede pryč od vodicí linky a nic ho nesmí zastavit
      const probe = new Sim(track, [{ ...entries[0], human: true, pid: 'probe' }], { laps: 3, seed: 99 });
      const pc = probe.cars[0];
      for (let k = 0; k < 60 * 90; k++) {
        pc.input.throttle = 1;
        pc.input.steer = probe.time < 2 ? 1 : 0;
        probe.step(1 / 60);
        probe.events.length = 0;
      }
      if (!Number.isFinite(pc.x + pc.z) || Math.abs(pc.lat) < 1000) fail(`něco drží auta u trati – po 90 s jízdy pryč je jen ${Math.abs(pc.lat).toFixed(0)} m od linky`);
      console.log(`  bez bariéry: auto dojelo ${Math.abs(pc.lat).toFixed(0)} m od vodicí linky`);
      if ((count.shot ?? 0) < 20) fail('na placu se skoro nestřílelo');
      if (count.lap) fail('na volné ploše se nemají počítat kola');
      console.log(`  volná jízda: ujeto ${driven.map((d) => (d / 1000).toFixed(1)).join('/')} km · nejdál od startu ${Math.max(...farFromStart).toFixed(0)} m · nejdál od linky ${Math.max(...sim.cars.map((c) => Math.abs(c.lat))).toFixed(0)} m`);
    } else {
      if (sim.phase !== 'over') fail('závod neskončil do 400 s');
      if (res[0].lap < 3) fail('vítěz neodjel 3 kola');
      // několikrát zničené auto může být o kolo a kus zpět; méně než 1 kolo už znamená zaseknutí
      const slow = res.filter((c) => c.lap < 1);
      if (slow.length) fail(`auta, která nestihla ani 1 kolo: ${slow.map((c) => c.name).join(', ')}`);
    }
  }
}
console.log(failed ? '\nTEST SELHAL' : '\nVše v pořádku ✓');
process.exit(failed ? 1 : 0);
