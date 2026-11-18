/**
 * Závod – odpočet, samotná jízda a tabulka výsledků.
 * enter() postaví závod z aktuálního nastavení (trať, kola, hráči a jejich auta) a po výsledcích se vrací na výběr tratě.
 */
import { PLAYER_COLORS, hexCss } from '../../game/cars';
import { CAR_TYPES, carColor } from '../../game/content/cars';
import { gunAt } from '../../game/content/guns';
import { TRACKS } from '../../game/content/tracks';
import { CarEntry, Sim, SimEvent } from '../../game/sim';
import { CtrlMsg, EMPTY_INPUT, InputState } from '../../shared/protocol';
import { $, App, DIFFS, MAX_CARS, Screen, esc } from '../app';
import { KBD, Player } from '../session';

/** body za 1.–6. místo (+1 za každé zničené auto) */
const POINTS = [10, 8, 6, 5, 4, 3];
/** jak dlouho zůstane tabulka výsledků, než hra sama pokračuje (s) */
const RESULTS_TIME = 30;

export class RaceScreen implements Screen {
  private resultsT = 0;
  private hudSendT = 0;

  constructor(private app: App) {}

  // ------------------------------------------------------------ start / konec
  enter() {
    const { app } = this;
    const humans = app.session.active();
    if (!humans.length) { queueMicrotask(() => app.show('lobby')); return; }

    const idx = app.settings.trackIdx;
    app.loadWorld(idx);
    // každé auto jezdí ve své barvě (i dvě stejná auta); hráč se pozná podle jmenovky a HUD ve své slotové barvě
    const entries: CarEntry[] = humans.map((p) => ({
      name: p.name, color: carColor(p.carIdx), tagColor: PLAYER_COLORS[p.slot],
      typeIdx: p.carIdx, stats: CAR_TYPES[p.carIdx], gun: gunAt(p.gunIdx), human: true, pid: p.pid,
      // náklon telefonu dává plynulé hodnoty, klávesnice pořád jen -1/0/1
      analog: app.settings.tilt && p.pid !== KBD,
    }));
    // AI soupeři: kolik si hráči nastavili v lobby (0 = jedou jen lidi), ať se vejdou na start
    const bots = Math.max(0, Math.min(app.settings.bots, MAX_CARS - humans.length));
    entries.push(...app.aiEntries(bots, Math.floor(Math.random() * 6)));
    const sim = new Sim(app.track(idx), entries, { laps: app.settings.laps, aiSkill: DIFFS[app.settings.diff].skill });
    app.sim = sim;
    app.attractIdx = -1;
    for (const p of humans) { p.waiting = false; p.input = { ...EMPTY_INPUT }; }
    const ids = humans.map((p) => sim.carByPid(p.pid)!.id);
    app.view.setSim(sim, ids);
    app.hud.layout(app.view.getRects(), sim);
    app.hud.show(true);
    app.audio.setEngines(ids);
    app.phase = 'countdown';
    $('results').hidden = true;
  }

  exit() {
    const { app } = this;
    $('results').hidden = true;
    $('countdown').innerHTML = '';
    app.hud.clear();
    app.hud.show(false);
    app.audio.setEngines([]);
    app.session.prune();
  }

  private finish() {
    const { app } = this;
    const sim = app.sim;
    if (!sim) return;
    app.phase = 'results';
    this.resultsT = RESULTS_TIME;
    app.audio.setEngines([]);
    app.hud.show(false);
    // za tabulkou výsledků auta volně dojíždějí
    sim.attract = true;
    sim.phase = 'racing';

    const rows = [...sim.cars].sort((a, b) => a.place - b.place);
    let html = '';
    rows.forEach((c, i) => {
      const pts = (POINTS[c.place - 1] ?? 0) + c.kills;
      const p = c.pid ? app.session.players.get(c.pid) : undefined;
      if (p) p.points += pts;
      const best = c.bestLap ? c.bestLap.toFixed(2).replace('.', ',') + ' s' : '—';
      html += `<tr class="${c.pid ? 'human' : ''}" style="--pc:${hexCss(c.tagColor)};animation-delay:${i * 0.08}s">
        <td>${c.place}.</td><td class="name">${esc(c.name)}${c.pid ? '' : '<small>AI</small>'}</td><td>${c.stats.name}</td>
        <td>${best}</td><td>${c.kills}×</td><td>+${pts}${p ? `<small>celkem ${p.points}</small>` : ''}</td></tr>`;
    });
    $('results-body').innerHTML = html;
    $('results-track').textContent = `${sim.track.def.name} · ${sim.laps} ${sim.laps === 1 ? 'kolo' : sim.laps < 5 ? 'kola' : 'kol'}`;
    $('results').hidden = false;
    app.audio.finish();
    app.session.pushStates();
  }

  /** Po výsledcích: další trať v pořadí a zpět na výběr. */
  private next() {
    this.app.settings.trackIdx = (this.app.settings.trackIdx + 1) % TRACKS.length;
    this.app.show('track');
  }

  private abort() {
    this.app.toast('Závod ukončen');
    this.app.show('track');
  }

  // ------------------------------------------------------------ Screen
  refresh() { /* během závodu není co překreslovat */ }

  command(p: Player, m: CtrlMsg) {
    if (!this.app.session.isMaster(p)) return;
    if (this.app.phase === 'results' && (m.type === 'select' || m.type === 'back')) this.next();
  }

  key(e: KeyboardEvent) {
    if (e.code === 'Escape') { if (this.app.phase === 'results') this.next(); else this.abort(); }
    else if (e.code === 'Enter' && this.app.phase === 'results') this.next();
  }

  playerJoined(p: Player, isNew: boolean) {
    // návrat do rozjetého závodu: auto si zase převezme člověk; nový hráč počká na další závod
    const car = this.app.sim?.carByPid(p.pid);
    if (car) { car.human = true; p.waiting = false; }
    else if (isNew) p.waiting = true;
  }

  playerLeft(p: Player): boolean {
    const car = this.app.sim?.carByPid(p.pid);
    if (!car) return false;
    car.human = false; // než se vrátí, řídí za něj AI
    return true;
  }

  private kbdInput(): InputState {
    const keys = this.app.keys;
    const k = (...c: string[]) => c.some((x) => keys.has(x));
    return {
      s: (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0),
      b: k('ArrowDown', 'KeyS') ? 1 : 0,
      // Q a W jsou hlavní (levá ruka drží Q W A S D), MEZERNÍK a SHIFT zůstávají jako druhá možnost
      f: k('KeyQ', 'Space'),
      r: k('KeyE', 'KeyF'),
      d: k('KeyW', 'ShiftLeft', 'ShiftRight'),
    };
  }

  /** Vstupy hráčů → auta. */
  beforeStep() {
    const { app } = this;
    const sim = app.sim;
    if (!sim || app.phase === 'results') return;
    const kp = app.session.keyboard;
    if (kp) kp.input = this.kbdInput();
    for (const p of app.session.players.values()) {
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

  update(dt: number) {
    const { app } = this;
    const sim = app.sim;
    if (!sim) return;
    if (app.phase === 'results') {
      this.resultsT -= dt;
      const m = app.session.master();
      $('results-hint').textContent = !m || m.pid === KBD ? `ENTER = pokračovat (${Math.ceil(this.resultsT)})` : `${m.name}: zmáčkni POKRAČOVAT (${Math.ceil(this.resultsT)})`;
      if (this.resultsT <= 0) this.next();
      return;
    }
    app.hud.update(sim, dt);
    for (const p of app.session.players.values()) {
      const car = sim.carByPid(p.pid);
      if (car) app.audio.updateEngine(car.id, car.speed, car.stats.top, car.input.throttle, car.nitroOn, car.dead);
    }
    // stav pro displej ovladače
    this.hudSendT -= dt;
    if (this.hudSendT <= 0) {
      this.hudSendT = 0.25;
      for (const p of app.session.players.values()) {
        const car = sim.carByPid(p.pid);
        if (!car) continue;
        app.session.sendHud(p, {
          type: 'hud', pos: car.rank, total: sim.cars.length, lap: Math.min(sim.laps, Math.max(1, car.lap + 1)), laps: sim.laps,
          hp: Math.max(0, car.hp / car.stats.hp), nitro: car.nitro, sec: car.secType, ammo: car.secAmmo, dead: car.dead, finished: car.finished,
          charge: car.gun.chargeMax ? car.charge / car.gun.chargeMax : 0,
          beam: car.beamT > 0 ? car.beam / car.beamT : 0,
        });
      }
    }
    // pojistka: fáze se řídí simulací, i kdyby událost 'go' někde zapadla
    if (app.phase === 'countdown' && sim.phase !== 'countdown') { app.phase = 'race'; app.session.pushStates(); }
    if (sim.phase === 'over' && app.phase === 'race') this.finish();
  }

  // ------------------------------------------------------------ události ze simulace
  private playerOf(s: Sim, carId: number): Player | undefined {
    const pid = s.cars[carId]?.pid;
    return pid ? this.app.session.players.get(pid) : undefined;
  }

  private count(text: string, go = false) {
    $('countdown').innerHTML = `<span class="${go ? 'go' : ''}">${text}</span>`;
  }

  events(s: Sim, events: SimEvent[]) {
    const { app } = this;
    const { hud, audio, session } = app;
    if (app.phase === 'results') return;
    for (const e of events) {
      switch (e.t) {
        case 'count': this.count(String(e.n)); audio.beep(false); break;
        case 'go':
          this.count('GO!', true); audio.beep(true);
          app.phase = 'race';
          session.pushStates();
          break;
        case 'hit': session.buzz(this.playerOf(s, e.car), 25); break;
        case 'crash': for (const id of [e.a, e.b]) session.buzz(this.playerOf(s, id), 60); break;
        case 'wall': if (e.force > 5) session.buzz(this.playerOf(s, e.car), 50); break;
        case 'pickup':
          if (s.cars[e.car].pid) {
            const label = { repair: '+ OPRAVA', rocket: '+ RAKETY', nitro: 'BOOST ×1,7' }[e.kind];
            hud.message(e.car, label, e.kind === 'nitro' ? 'gold small' : 'good small', 1.1);
          }
          break;
        case 'destroyed': {
          const victim = s.cars[e.car], killer = e.by >= 0 ? s.cars[e.by] : null;
          hud.message(e.car, 'ZNIČEN!', 'bad', 2.2);
          session.buzz(this.playerOf(s, e.car), 400);
          if (killer) {
            hud.message(killer.id, `ZNIČIL JSI ${victim.name}`, 'gold small', 2);
            hud.feed(`<span style="color:${hexCss(killer.tagColor)}">${esc(killer.name)}</span><span class="x">✖</span><span style="color:${hexCss(victim.tagColor)}">${esc(victim.name)}</span>`);
          } else {
            hud.feed(`<span style="color:${hexCss(victim.tagColor)}">${esc(victim.name)}</span><span class="x">✖</span>svodidla`);
          }
          break;
        }
        case 'lap':
          if (s.cars[e.car].pid) {
            audio.lap();
            const last = e.lap === s.laps;
            hud.message(e.car, last ? 'POSLEDNÍ KOLO!' : `KOLO ${e.lap}/${s.laps}`, last ? 'gold' : '', 2);
          }
          break;
        case 'finish': {
          const c = s.cars[e.car];
          if (c.pid) { audio.finish(); hud.message(e.car, `CÍL · ${e.place}. MÍSTO`, 'gold', 6); }
          hud.feed(`🏁 <span style="color:${hexCss(c.tagColor)}">${esc(c.name)}</span> – ${e.place}. místo`);
          break;
        }
      }
    }
  }
}
