/**
 * HUD nad 3D obrazem (obyčejné HTML): pořadí, kolo, rychlost, zdraví, nitro, zbraň, hlášky a minimapa.
 * Každý hráč má vlastní panel přesně nad svým výřezem obrazovky.
 */
import { hexCss } from '../game/cars';
import type { Car, PickupKind, Sim } from '../game/sim';
import type { ViewRect } from '../render/gameView';
import { drawPickupIcon } from '../render/textures';

interface Panel {
  carId: number;
  el: HTMLElement;
  pos: HTMLElement; total: HTMLElement; lap: HTMLElement; speed: HTMLElement;
  hp: HTMLElement; nitro: HTMLElement; ammo: HTMLElement; icon: HTMLCanvasElement;
  msg: HTMLElement; warn: HTMLElement; dmg: HTMLElement;
  msgT: number; lastSec: string; lastHp: number;
}

const SEC_COLORS: Record<string, string> = { rocket: '#ff3b2f', mine: '#ff9d1a' };

export class Hud {
  private root: HTMLElement;
  private panels: Panel[] = [];
  private mini: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private feedEl: HTMLElement;
  private miniBounds = { minX: 0, minZ: 0, scale: 1, ox: 0, oz: 0 };
  private frame = 0;

  constructor() {
    this.root = document.getElementById('hud')!;
    this.mini = document.getElementById('minimap') as HTMLCanvasElement;
    this.mctx = this.mini.getContext('2d')!;
    this.feedEl = document.getElementById('feed')!;
  }

  clear() {
    for (const p of this.panels) p.el.remove();
    this.panels = [];
    this.feedEl.innerHTML = '';
  }

  show(on: boolean) {
    this.root.style.display = on ? '' : 'none';
    this.mini.style.display = on ? '' : 'none';
    this.feedEl.style.display = on ? '' : 'none';
  }

  /** Vytvoří panely podle rozdělení obrazovky. */
  layout(rects: ViewRect[], sim: Sim) {
    this.clear();
    const humans = rects.filter((r) => r.carId >= 0);
    rects.forEach((r, idx) => {
      const el = document.createElement('div');
      // třída podle pozice výřezu: HUD se u minimapy odsune stranou
      el.className = 'view' + (r.carId < 0 ? ' tv' : '') + (rects.length === 4 ? ' q' + idx : rects.length === 2 ? ' h' + idx : '');
      el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--u:${Math.min(r.h, r.w * 0.62) / 100}px`;
      if (r.carId < 0) {
        el.innerHTML = humans.length ? `<div class="tv-label">● LIVE</div>` : '';
        this.root.appendChild(el);
        this.panels.push({ carId: -1, el } as unknown as Panel);
        return;
      }
      const c = sim.cars[r.carId];
      el.style.setProperty('--pc', hexCss(c.color));
      el.innerHTML = `
        <div class="v-pos"><b class="n">1</b><span class="of">/<span class="t">${sim.cars.length}</span></span></div>
        <div class="v-top"><div class="v-name"></div><div class="v-lap">KOLO <b>1</b>/${sim.laps}</div></div>
        <div class="v-speed"><b>0</b><span>km/h</span></div>
        <div class="v-bars">
          <div class="bar hp"><i></i><em>ZDRAVÍ</em></div>
          <div class="bar nitro"><i></i><em>NITRO</em></div>
        </div>
        <div class="v-weapon"><canvas width="64" height="64"></canvas><b>×0</b></div>
        <div class="v-msg"></div>
        <div class="v-warn">◀ PROTISMĚR ▶</div>
        <div class="v-dmg"></div>`;
      this.root.appendChild(el);
      const q = (s: string) => el.querySelector(s) as HTMLElement;
      q('.v-name').textContent = c.name;
      this.panels.push({
        carId: r.carId, el,
        pos: q('.v-pos .n'), total: q('.v-pos .t'), lap: q('.v-lap b'), speed: q('.v-speed b'),
        hp: q('.bar.hp i'), nitro: q('.bar.nitro i'), ammo: q('.v-weapon b'), icon: q('.v-weapon canvas') as HTMLCanvasElement,
        msg: q('.v-msg'), warn: q('.v-warn'), dmg: q('.v-dmg'),
        msgT: 0, lastSec: '', lastHp: c.hp,
      });
    });
    // minimapa: u jednoho hráče v rohu, při split-screenu uprostřed
    this.mini.className = humans.length <= 1 ? 'corner' : humans.length === 2 ? 'mid-right' : 'center';
    const tr = sim.track;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < tr.n; i++) {
      minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]);
      minZ = Math.min(minZ, tr.z[i]); maxZ = Math.max(maxZ, tr.z[i]);
    }
    const S = this.mini.width, pad = 16;
    const scale = Math.min((S - pad * 2) / (maxX - minX), (S - pad * 2) / (maxZ - minZ));
    this.miniBounds = { minX, minZ, scale, ox: (S - (maxX - minX) * scale) / 2, oz: (S - (maxZ - minZ) * scale) / 2 };
  }

  message(carId: number, text: string, cls = '', dur = 1.8) {
    const p = this.panels.find((x) => x.carId === carId);
    if (!p || !p.msg) return;
    p.msg.textContent = text;
    p.msg.className = 'v-msg show ' + cls;
    p.msgT = dur;
  }

  feed(html: string) {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.feedEl.appendChild(d);
    while (this.feedEl.children.length > 4) this.feedEl.firstChild!.remove();
    setTimeout(() => d.remove(), 4500);
  }

  update(sim: Sim, dt: number) {
    this.frame++;
    for (const p of this.panels) {
      if (p.carId < 0) continue;
      const c = sim.cars[p.carId];
      if (!c) continue;
      p.pos.textContent = String(c.rank);
      p.lap.textContent = String(Math.min(sim.laps, Math.max(1, c.lap + 1)));
      p.speed.textContent = String(Math.round(Math.abs(c.speed) * 3.6));
      const hk = Math.max(0, c.hp / c.stats.hp);
      p.hp.style.transform = `scaleX(${hk})`;
      p.hp.className = hk < 0.3 ? 'low' : '';
      p.nitro.style.transform = `scaleX(${c.nitro})`;
      p.nitro.className = c.nitroOn ? 'on' : '';
      p.ammo.textContent = '×' + c.secAmmo;
      if (p.lastSec !== c.secType) {
        p.lastSec = c.secType;
        const g = p.icon.getContext('2d')!;
        g.clearRect(0, 0, 64, 64);
        drawPickupIcon(g, c.secType as PickupKind, 32, 32, 22, SEC_COLORS[c.secType]);
      }
      p.el.classList.toggle('noammo', c.secAmmo === 0);
      p.warn.classList.toggle('on', c.wrongWay > 1);
      // červený záblesk při poškození
      if (c.hp < p.lastHp - 0.5) { p.dmg.style.transition = 'none'; p.dmg.style.opacity = String(Math.min(0.85, 0.25 + (p.lastHp - c.hp) * 0.03)); }
      else if (p.dmg.style.opacity !== '0') { p.dmg.style.transition = 'opacity .5s'; p.dmg.style.opacity = '0'; }
      p.lastHp = c.hp;
      p.el.classList.toggle('dead', c.dead);
      if (p.msgT > 0) { p.msgT -= dt; if (p.msgT <= 0) p.msg.className = 'v-msg'; }
    }
    if (this.frame % 2 === 0) this.drawMini(sim);
  }

  private drawMini(sim: Sim) {
    const g = this.mctx, tr = sim.track, b = this.miniBounds, S = this.mini.width;
    const X = (x: number) => b.ox + (x - b.minX) * b.scale, Z = (z: number) => b.oz + (z - b.minZ) * b.scale;
    g.clearRect(0, 0, S, S);
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < tr.n; i += 2) { if (i === 0) g.moveTo(X(tr.x[i]), Z(tr.z[i])); else g.lineTo(X(tr.x[i]), Z(tr.z[i])); }
    g.closePath();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 5; g.stroke();
    // cíl
    g.fillStyle = '#fff';
    g.fillRect(X(tr.x[0]) - 4, Z(tr.z[0]) - 4, 8, 8);
    const order = [...sim.cars].sort((a, c) => Number(a.human) - Number(c.human));
    for (const c of order) this.dot(g, c, X(c.x), Z(c.z));
  }

  private dot(g: CanvasRenderingContext2D, c: Car, x: number, y: number) {
    if (c.dead) return;
    g.beginPath();
    g.arc(x, y, c.human ? 8 : 5.5, 0, Math.PI * 2);
    g.fillStyle = hexCss(c.color);
    g.fill();
    g.lineWidth = c.human ? 3 : 1.5;
    g.strokeStyle = c.human ? '#fff' : 'rgba(0,0,0,0.7)';
    g.stroke();
  }
}
