/**
 * Headless test simulace (bez grafiky): na každé trati odjede závod 6 aut řízených AI
 * a zkontroluje, že auta dojedou, nikde se nezaseknou a ve stavu nejsou NaN.
 *
 *   npm run test:sim
 */
import { buildTrack } from '../client/src/game/track';
import { TRACKS } from '../client/src/game/content/tracks';
import { CAR_TYPES } from '../client/src/game/content/cars';
import { Sim, CarEntry } from '../client/src/game/sim';
import { aiThink } from '../client/src/game/ai';

let failed = false;
const fail = (msg: string) => { failed = true; console.log('  ✗ ' + msg); };

for (const def of TRACKS) {
  for (const withHuman of [false, true]) {
    const track = buildTrack(def);
    const entries: CarEntry[] = [];
    for (let i = 0; i < 6; i++) {
      entries.push({ name: 'AI' + i, color: 0, typeIdx: i % 4, stats: CAR_TYPES[i % 4], human: withHuman && i === 0, pid: null });
    }
    const sim = new Sim(track, entries, { laps: 3, seed: 1234 + def.id.length });
    const dt = 1 / 60;
    const count: Record<string, number> = {};
    let steps = 0, maxSpeed = 0;
    while (sim.phase !== 'over' && steps < 60 * 400) {
      // "člověka" v testu řídí taky AI – ověří se tím cesty kódu pro lidské hráče
      for (const c of sim.cars) if (c.human && !c.finished) aiThink(sim, c, dt);
      sim.step(dt);
      steps++;
      for (const e of sim.events) count[e.t] = (count[e.t] ?? 0) + 1;
      sim.events.length = 0;
      for (const c of sim.cars) {
        if (!Number.isFinite(c.x + c.z + c.h + c.vx + c.vz + c.hp)) { fail(`NaN ve stavu auta ${c.name}`); steps = 1e9; break; }
        if (Math.abs(c.lat) > track.wallDist + 0.5) fail(`auto ${c.name} je mimo trať (lat ${c.lat.toFixed(1)})`);
        maxSpeed = Math.max(maxSpeed, c.speed);
      }
    }
    console.log(`\n${def.name} ${withHuman ? '(s "člověkem")' : '(jen AI)'} – ${track.length.toFixed(0)} m, čas závodu ${sim.time.toFixed(1)} s`);
    const res = [...sim.cars].sort((a, b) => a.place - b.place);
    for (const c of res) {
      console.log(`  ${c.place}. ${c.name.padEnd(4)} ${c.stats.name.padEnd(9)} kol ${Math.max(0, c.lap)}  nejlepší kolo ${c.bestLap.toFixed(1)} s  zničení ${c.kills}/${c.deaths}${c.human ? '  ← člověk' : ''}`);
    }
    console.log(`  události: ${Object.entries(count).map(([k, v]) => `${k}=${v}`).join(' ')}  max ${(maxSpeed * 3.6).toFixed(0)} km/h`);
    if (sim.phase !== 'over') fail('závod neskončil do 400 s');
    if (res[0].lap < 3) fail('vítěz neodjel 3 kola');
    // několikrát zničené auto může být o kolo a kus zpět; méně než 1 kolo už znamená zaseknutí
    const slow = res.filter((c) => c.lap < 1);
    if (slow.length) fail(`auta, která nestihla ani 1 kolo: ${slow.map((c) => c.name).join(', ')}`);
  }
}
console.log(failed ? '\nTEST SELHAL' : '\nVše v pořádku ✓');
process.exit(failed ? 1 : 0);
