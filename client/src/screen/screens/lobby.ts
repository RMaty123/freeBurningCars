/**
 * Lobby – připojování hráčů (QR kód), počet kol, počet AI soupeřů a jejich obtížnost.
 * První hráč (nebo ENTER na PC) pokračuje na výběr tratě.
 */
import { PLAYER_COLORS, hexCss } from '../../game/cars';
import type { CtrlMsg } from '../../shared/protocol';
import { $, App, DIFFS, MAX_BOTS, MAX_CARS, Screen, esc } from '../app';
import { KBD, MAX_PLAYERS, NetOption, Player, RoomInfo } from '../session';

export class LobbyScreen implements Screen {
  /** adresy, na kterých je hra vidět (jedna na síťovku) a která je zrovna v QR kódu */
  private nets: NetOption[] = [];
  private netIdx = 0;
  /** rozbalený seznam síťovek pod QR kódem */
  private netOpen = false;

  constructor(private app: App) {}

  enter() {
    this.app.phase = 'lobby';
    this.app.startAttract();
    $('lobby').hidden = false;
    this.netOpen = false; // seznam sítí se vždy vrací zabalený
    this.showNet();
    this.refresh();
  }

  exit() {
    $('lobby').hidden = true;
  }

  update() { /* lobby je statické */ }

  onRoom(r: RoomInfo) {
    this.nets = r.nets;
    // drž se stejné síťovky i po obnovení stránky, jinak ber tu s bránou do sítě
    const keep = this.nets.findIndex((n) => n.ip === this.nets[this.netIdx]?.ip);
    this.netIdx = keep >= 0 ? keep : 0;
    this.showNet();
  }

  /** Přepne QR kód a adresu na jinou síťovku (telefon může viset na jiné síti než PC). */
  private pickNet(i: number) {
    if (this.nets.length < 2) return;
    this.netIdx = (i + this.nets.length) % this.nets.length;
    this.netOpen = false;
    this.showNet();
    this.app.audio.ui();
  }

  private showNet() {
    const net = this.nets[this.netIdx];
    const qr = $('qr') as HTMLImageElement;
    const toggle = $('net-toggle'), list = $('net-switch'), warn = $('net-warn');
    if (!net) {
      qr.removeAttribute('src');
      $('join-url').textContent = 'PC není připojené k síti';
      toggle.hidden = list.hidden = true;
      warn.hidden = false;
      warn.textContent = 'PC není připojené k síti – telefon se nepřipojí. Připoj PC k Wi-Fi a obnov stránku.';
      return;
    }
    qr.src = net.qr;
    $('join-url').textContent = net.url.replace(/^http:\/\//, '').replace(/\?room=.*/, '');
    warn.hidden = true;
    // s jedinou síťovkou není co přepínat – přepínač se vůbec neukáže
    toggle.hidden = this.nets.length < 2;
    toggle.textContent = (this.netOpen ? 'jiná síť ▴' : 'jiná síť ▾');
    toggle.onclick = () => { this.netOpen = !this.netOpen; this.showNet(); };
    list.hidden = !this.netOpen || this.nets.length < 2;
    if (list.hidden) return;
    list.innerHTML = '<p class="net-head">SÍŤ PRO QR KÓD</p>' + this.nets.map((n, i) => `
      <button class="net-opt${i === this.netIdx ? ' on' : ''}" data-i="${i}">
        <span class="net-dot"></span>
        <b>${esc(n.iface)}</b>
        <small>${esc(n.ip)}</small>
      </button>`).join('') + '<p class="net-foot">přepínat jde i klávesou <kbd>N</kbd></p>';
    for (const el of list.querySelectorAll<HTMLElement>('.net-opt')) {
      el.onclick = () => this.pickNet(Number(el.dataset.i));
    }
  }

  command(p: Player, m: CtrlMsg) {
    const { app } = this;
    const isMaster = app.session.isMaster(p);
    if (m.type === 'laps' && isMaster) {
      app.settings.laps = Math.max(1, Math.min(9, app.settings.laps + m.dir));
      app.audio.ui();
    } else if (m.type === 'bots' && isMaster) {
      app.settings.bots = Math.max(0, Math.min(this.maxBots(), app.settings.bots + m.dir));
      app.audio.ui();
      this.refresh();
    } else if (m.type === 'select' && isMaster) {
      this.proceed();
      return;
    }
    app.session.changed();
  }

  key(e: KeyboardEvent) {
    const { app } = this;
    const s = app.session, kp = s.keyboard;
    if (e.code === 'Enter') {
      // první ENTER přidá hráče na klávesnici, další pokračuje na výběr tratě
      if (!kp) {
        if (s.addKeyboard()) { app.audio.ui(); app.toast('Klávesnice připojena · ENTER pokračovat na výběr tratě'); }
      } else this.proceed();
    } else if (e.code === 'Escape') {
      s.removeKeyboard();
    } else if (e.code === 'KeyL') {
      app.settings.laps = app.settings.laps >= 5 ? 1 : app.settings.laps + 1;
      app.audio.ui();
      s.changed();
    } else if (e.code === 'KeyB') {
      // B = počet AI soupeřů dokola (až na 0, kdy jedou jen lidi)
      const max = this.maxBots();
      app.settings.bots = app.settings.bots >= max ? 0 : app.settings.bots + 1;
      app.audio.ui();
      s.changed();
    } else if (e.code === 'KeyN') {
      this.pickNet(this.netIdx + 1); // další síťovka v QR kódu
    } else if (e.code === 'KeyO') {
      app.settings.diff = (app.settings.diff + 1) % DIFFS.length;
      app.audio.ui();
      this.refresh();
    }
  }

  /** Kolik AI se ještě vejde na start vedle připojených hráčů. */
  private maxBots(): number {
    return Math.max(0, Math.min(MAX_BOTS, MAX_CARS - Math.max(1, this.app.session.active().length)));
  }

  private proceed() {
    if (this.app.session.active().length) this.app.show('track');
  }

  refresh() {
    const { app } = this;
    const sorted = app.session.sorted();
    const m = app.session.master();
    let html = '';
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const p = sorted.find((x) => x.slot === s);
      if (!p) {
        html += `<li class="empty" style="--pc:${hexCss(PLAYER_COLORS[s])}"><div class="badge">${s + 1}</div><div class="who"><b>volné místo</b><small>naskenuj QR kód</small></div><div class="tagr"></div></li>`;
        continue;
      }
      html += `<li style="--pc:${hexCss(PLAYER_COLORS[s])}">
        <div class="badge">${s + 1}</div>
        <div class="who"><b>${esc(p.name)}</b><small>${p.pid === KBD ? 'klávesnice' : p.connected ? 'telefon' : 'odpojen'}${p.points ? ` · ${p.points} b.` : ''}</small></div>
        <div class="tagr">${m?.pid === p.pid ? '<span class="master">★ ovládá menu</span>' : ''}</div>
      </li>`;
    }
    $('slots').innerHTML = html;
    $('laps').textContent = String(app.settings.laps);
    $('ai-level').textContent = DIFFS[app.settings.diff].name;
    // nabídku zúží, když se připojí další hráči
    app.settings.bots = Math.min(app.settings.bots, this.maxBots());
    const bots = app.settings.bots;
    $('ai-count').textContent = bots ? `${bots} AI` : 'žádní';
    $('ai-hint').textContent = bots ? '' : ' · jen hráči';
    const sh = $('start-hint');
    if (!sorted.length) { sh.textContent = 'Čekám na hráče…'; sh.classList.remove('ready'); }
    else {
      sh.textContent = m?.pid === KBD ? 'ENTER = VÝBĚR TRATĚ' : `${m?.name ?? 'Hráč 1'}: zmáčkni VYBRAT TRAŤ`;
      sh.classList.add('ready');
    }
  }
}
