/**
 * Kterou IP adresu dát do QR kódu?
 *
 * Projdeme směrovací tabulku a najdeme výchozí trasu (0.0.0.0/0 = "default gateway").
 * Síťovka, přes kterou vede, je ta, kterou je PC připojené do domácí sítě (Wi-Fi / kabel),
 * takže na její adresu se dostane i telefon. Virtuální adaptéry (VirtualBox, WSL, Hyper-V, VPN bez brány…)
 * výchozí bránu nemají, takže se tím automaticky odfiltrují.
 *
 * Postup:
 *   1. proměnná prostředí HOST_IP (ruční přepsání, když by automatika netrefila)
 *   2. směrovací tabulka: Windows `route print -4`, Linux `ip -4 route show default`, macOS `route -n get default`
 *      – při více branách vyhrává nejnižší metrika (stejně jako to dělá systém)
 *   3. záloha: UDP "connect" na veřejnou adresu – systém sám vybere zdrojovou adresu podle výchozí trasy
 *      (nic se neposílá, funguje i bez internetu, pokud brána existuje)
 *   4. poslední záloha: odhad podle rozsahu adres (192.168.x.x napřed)
 */
import { execFile } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { networkInterfaces, platform } from 'node:os';

export interface LanAddress {
  ip: string;
  /** název síťovky, např. "Wi-Fi" nebo "Ethernet" */
  iface: string;
}

export interface PrimaryAddress extends LanAddress {
  gateway: string;
  /** jak jsme adresu našli */
  source: 'env' | 'route' | 'udp' | 'guess';
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Všechny IPv4 adresy počítače (bez localhostu a bez APIPA 169.254.x.x). */
export function allAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  for (const [iface, list] of Object.entries(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) out.push({ ip: ni.address, iface });
    }
  }
  return out;
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000, windowsHide: true, encoding: 'latin1' }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

interface Route { gateway: string; ip?: string; iface?: string; metric: number }

/** Výchozí trasy ze směrovací tabulky systému. */
async function defaultRoutes(): Promise<Route[]> {
  const os = platform();
  const routes: Route[] = [];
  if (os === 'win32') {
    // Řádky aktivních tras: "0.0.0.0  0.0.0.0  <brána>  <adresa síťovky>  <metrika>"
    // (záhlaví je podle jazyka Windows, ale čísla v řádcích jsou vždy stejná)
    const out = await run('route', ['print', '-4']);
    const re = /^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d+)\s*$/gm;
    for (const m of out.matchAll(re)) routes.push({ gateway: m[1], ip: m[2], metric: Number(m[3]) });
  } else if (os === 'darwin') {
    const out = await run('route', ['-n', 'get', 'default']);
    const gw = /gateway:\s*(\S+)/.exec(out)?.[1], iface = /interface:\s*(\S+)/.exec(out)?.[1];
    if (gw && IPV4.test(gw) && iface) routes.push({ gateway: gw, iface, metric: 0 });
  } else {
    // "default via 192.168.1.1 dev wlan0 proto dhcp src 192.168.1.50 metric 600"
    const out = await run('ip', ['-4', 'route', 'show', 'default']);
    for (const line of out.split('\n')) {
      const gw = /\bvia\s+(\S+)/.exec(line)?.[1], dev = /\bdev\s+(\S+)/.exec(line)?.[1];
      if (!gw || !dev || !IPV4.test(gw)) continue;
      routes.push({ gateway: gw, iface: dev, ip: /\bsrc\s+(\S+)/.exec(line)?.[1], metric: Number(/\bmetric\s+(\d+)/.exec(line)?.[1] ?? 0) });
    }
  }
  return routes.sort((a, b) => a.metric - b.metric);
}

/** Adresa, kterou systém použije pro odchozí spojení přes výchozí trasu. */
function udpProbe(): Promise<string> {
  return new Promise((resolve) => {
    const s = createSocket('udp4');
    const done = (ip: string) => { try { s.close(); } catch { /* už zavřeno */ } resolve(ip); };
    s.on('error', () => done(''));
    try {
      s.connect(53, '1.1.1.1', () => {
        try { done(s.address().address); } catch { done(''); }
      });
    } catch { done(''); }
    setTimeout(() => done(''), 1500);
  });
}

function guess(addrs: LanAddress[]): LanAddress | undefined {
  const score = (ip: string) =>
    ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  return [...addrs].sort((a, b) => score(a.ip) - score(b.ip))[0];
}

export async function primaryAddress(): Promise<PrimaryAddress | null> {
  const addrs = allAddresses();
  const byIp = (ip?: string) => addrs.find((a) => a.ip === ip);

  const env = process.env.HOST_IP?.trim();
  if (env && IPV4.test(env)) return { ip: env, iface: byIp(env)?.iface ?? 'HOST_IP', gateway: '', source: 'env' };

  for (const r of await defaultRoutes()) {
    const a = byIp(r.ip) ?? (r.iface ? addrs.find((x) => x.iface === r.iface) : undefined);
    if (a) return { ...a, gateway: r.gateway, source: 'route' };
  }

  const probe = byIp(await udpProbe());
  if (probe) return { ...probe, gateway: '', source: 'udp' };

  const g = guess(addrs);
  return g ? { ...g, gateway: '', source: 'guess' } : null;
}
