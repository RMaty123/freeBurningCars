/**
 * Free Burning Cars – server
 * --------------------------
 * Jeden proces, jeden port:
 *   - Express servíruje hru (ve vývoji přes Vite middleware, v produkci ze složky dist/)
 *   - Socket.IO přeposílá zprávy mezi obrazovkou (host) a telefony (ovladače)
 *
 * Samotná hra (fyzika, AI, grafika) běží v prohlížeči na obrazovce, stejně jako u AirConsole.
 * Server je jen "pošťák", díky tomu je odezva ovladačů co nejmenší.
 */
import express from 'express';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Server, Socket } from 'socket.io';
import QRCode from 'qrcode';
import { allAddresses, primaryAddress, type LanAddress } from './net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';
const MAX_PLAYERS = 4;

interface Room {
  code: string;
  host: Socket | null;
  /** pid -> socket ovladače */
  players: Map<string, Socket>;
  /** časovač smazání místnosti poté, co se odpojí obrazovka */
  killTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();

function newRoomCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // bez I a O, ať se to neplete
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += abc[Math.floor(Math.random() * abc.length)];
    if (!rooms.has(code)) return code;
  }
}

async function main() {
  const app = express();
  const http = createServer(app);
  const io = new Server(http, {
    // malé zprávy, žádná komprese = menší latence
    perMessageDeflate: false,
    pingInterval: 5000,
    pingTimeout: 8000,
  });

  app.get('/api/info', (_req, res) => {
    void primaryAddress().then((primary) => res.json({ port: PORT, primary, addresses: allAddresses(), rooms: rooms.size }));
  });

  // ---------- Socket.IO: přeposílání zpráv ----------
  io.on('connection', (socket) => {
    let role: 'host' | 'ctrl' | null = null;
    let room: Room | null = null;
    let pid = '';

    // Obrazovka zakládá (nebo po reloadu znovu přebírá) místnost.
    socket.on('host:create', async (data: { room?: string } | undefined, ack?: (r: unknown) => void) => {
      const wanted = String(data?.room ?? '').toUpperCase();
      let r = wanted && rooms.get(wanted);
      if (r && r.host && r.host.connected && r.host.id !== socket.id) r = undefined; // obsazeno jinou obrazovkou
      if (!r) {
        const code = wanted && /^[A-Z]{4}$/.test(wanted) && !rooms.has(wanted) ? wanted : newRoomCode();
        r = { code, host: null, players: new Map(), killTimer: null };
        rooms.set(code, r);
      }
      if (r.killTimer) { clearTimeout(r.killTimer); r.killTimer = null; }
      r.host = socket;
      role = 'host';
      room = r;

      // Pro každou síťovku se pošle vlastní adresa i QR kód, ať jde na obrazovce přepnout,
      // kdyby PC viselo na víc sítích (Wi-Fi + kabel, VPN, virtuální adaptéry…).
      // První je ta s výchozí bránou – zjišťuje se pokaždé znovu, kdyby se PC přepojilo jinam.
      const primary = await primaryAddress();
      const rest = allAddresses().filter((a) => a.ip !== primary?.ip);
      const list: LanAddress[] = primary ? [primary, ...rest] : rest.length ? rest : [{ ip: 'localhost', iface: 'localhost' }];
      const nets = await Promise.all(list.map(async (a, i) => {
        const url = `http://${a.ip}:${PORT}/controller.html?room=${r!.code}`;
        let qr = '';
        try {
          qr = await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b0d14', light: '#ffffff' } });
        } catch { /* QR není kritický */ }
        return {
          ip: a.ip, iface: a.iface, url, qr,
          primary: i === 0 && !!primary,
          gateway: i === 0 ? primary?.gateway : undefined,
          source: i === 0 ? primary?.source : undefined,
        };
      }));
      ack?.({ room: r.code, nets, players: [...r.players.keys()] });
      // ovladače, které přežily reload obrazovky, se ohlásí znovu
      for (const s of r.players.values()) s.emit('host:back');
    });

    // Telefon se připojuje do místnosti.
    socket.on('ctrl:join', (data: { room?: string; pid: string; name: string }, ack?: (r: unknown) => void) => {
      const code = String(data?.room ?? '').toUpperCase().trim();
      // Bez kódu (telefon ho nikde nezadává) se bere jediná běžící hra; víc her naráz rozliší QR kód.
      const live = [...rooms.values()].filter((x) => x.host?.connected);
      const r = code ? rooms.get(code) : live.length === 1 ? live[0] : null;
      if (!r || !r.host) {
        return ack?.({
          ok: false,
          error: live.length > 1
            ? 'Na síti běží víc her – naskenuj QR kód z obrazovky.'
            : 'Hra neběží. Spusť ji na počítači a naskenuj QR kód z obrazovky.',
        });
      }
      const id = String(data.pid || '').slice(0, 40);
      if (!id) return ack?.({ ok: false, error: 'Chybí ID hráče.' });
      if (!r.players.has(id) && r.players.size >= MAX_PLAYERS) {
        return ack?.({ ok: false, error: `Místnost je plná (max ${MAX_PLAYERS} hráči).` });
      }
      const old = r.players.get(id);
      if (old && old.id !== socket.id) old.disconnect(true);
      r.players.set(id, socket);
      role = 'ctrl';
      room = r;
      pid = id;
      const name = String(data.name || 'Hráč').replace(/[<>]/g, '').slice(0, 12) || 'Hráč';
      r.host.emit('player:join', { pid, name });
      ack?.({ ok: true, room: r.code });
    });

    // Vstupy z ovladače (plyn, zatáčení…) – "volatile": zastaralý paket se klidně zahodí.
    socket.on('ctrl:input', (d: unknown) => {
      if (role === 'ctrl' && room?.host) room.host.volatile.emit('player:input', { pid, d });
    });
    // Ostatní zprávy z ovladače (výběr auta, start…) – spolehlivě.
    socket.on('ctrl:msg', (m: unknown) => {
      if (role === 'ctrl' && room?.host) room.host.emit('player:msg', { pid, m });
    });
    // Obrazovka -> jeden ovladač / všechny ovladače.
    socket.on('host:to', (data: { pid: string; m: unknown }) => {
      if (role === 'host' && room) room.players.get(data.pid)?.emit('host:msg', data.m);
    });
    socket.on('host:all', (m: unknown) => {
      if (role === 'host' && room) for (const s of room.players.values()) s.emit('host:msg', m);
    });

    socket.on('disconnect', () => {
      if (!room) return;
      if (role === 'ctrl') {
        if (room.players.get(pid)?.id === socket.id) {
          room.players.delete(pid);
          room.host?.emit('player:leave', { pid });
        }
      } else if (role === 'host' && room.host?.id === socket.id) {
        const r = room;
        r.host = null;
        for (const s of r.players.values()) s.emit('host:gone');
        // po reloadu obrazovky místnost ještě chvíli držíme
        r.killTimer = setTimeout(() => {
          if (!r.host) {
            for (const s of r.players.values()) s.disconnect(true);
            rooms.delete(r.code);
          }
        }, 60_000);
      }
    });
  });

  // ---------- Statické soubory / Vite ----------
  const dist = resolve(ROOT, 'dist');
  if (PROD) {
    if (!existsSync(dist)) {
      console.error('Složka dist/ neexistuje. Spusť nejdřív "npm run build", nebo použij "npm run dev".');
      process.exit(1);
    }
    app.use(express.static(dist, { extensions: ['html'] }));
  } else {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({
      configFile: resolve(ROOT, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { server: http }, host: true },
    });
    app.use(vite.middlewares);
  }

  http.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} už něco používá. Zavři druhý server, nebo spusť s jiným portem:\n  set PORT=3001 && npm run dev\n`);
    } else console.error(err);
    process.exit(1);
  });

  http.listen(PORT, '0.0.0.0', async () => {
    const primary = await primaryAddress();
    console.log('\n  FREE BURNIN’N CARS  –  server běží\n');
    console.log(`  Obrazovka (na tomhle PC):  http://localhost:${PORT}`);
    if (primary) {
      const how = primary.source === 'route' ? `výchozí brána ${primary.gateway}` : primary.source === 'env' ? 'nastaveno v HOST_IP' : primary.source === 'udp' ? 'podle výchozí trasy systému' : 'odhad – výchozí bránu jsem nenašel';
      console.log(`  Ovladač (telefon):         http://${primary.ip}:${PORT}/controller.html`);
      console.log(`                             síťovka "${primary.iface}", ${how}`);
      const others = allAddresses().filter((a) => a.ip !== primary.ip);
      if (others.length) console.log(`  Další adresy tohoto PC:    ${others.map((a) => `${a.ip} (${a.iface})`).join(', ')}`);
    } else {
      console.log('  Nenašel jsem žádnou síťovou adresu – telefon se nepřipojí, dokud PC není na Wi-Fi/LAN.');
    }
    console.log('\n  Nejjednodušší je naskenovat QR kód, který uvidíš na obrazovce.');
    console.log('  Jinou adresu do QR kódu vynutíš:  set HOST_IP=192.168.x.x && npm run dev\n');
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
