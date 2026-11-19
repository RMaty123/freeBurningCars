/**
 * Procedurální textury kreslené do canvasu – hra nepotřebuje žádné obrázkové soubory.
 */
import * as THREE from 'three';
import { mulberry } from '../game/sim';
import type { ThemeId } from '../game/track';
import type { PickupKind } from '../game/sim';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, rnd: () => number, light: number, dark: number, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = rnd();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${light * rnd()})` : `rgba(0,0,0,${dark * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * size, 1 + rnd() * size);
  }
}

/**
 * Vozovka přes celou šířku koridoru (od svodidla ke svodidlu):
 * krajnice | obrubník | bílá čára | asfalt s přerušovanou středovou čárou | …
 * shoulderFrac = jaký podíl šířky zabírá krajnice na každé straně.
 */
export function roadTexture(theme: ThemeId, shoulderFrac: number, lanes = 2): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const rnd = mulberry(7);
  const asphalt = theme === 'city' ? '#23252c' : theme === 'desert' ? '#3a3531' : '#34363a';
  g.fillStyle = asphalt;
  g.fillRect(0, 0, W, H);
  speckle(g, W, H, 9000, rnd, 0.09, 0.22);
  // vyjeté stopy
  for (const u of [0.3, 0.42, 0.58, 0.7]) {
    const gr = g.createLinearGradient(u * W - 22, 0, u * W + 22, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(u * W - 22, 0, 44, H);
  }
  // praskliny
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    let x = rnd() * W, y = rnd() * H;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  const sh = shoulderFrac * W;
  const curb = sh * 0.62;
  for (const side of [0, 1]) {
    const x0 = side === 0 ? 0 : W - sh;
    // krajnice (štěrk / beton)
    g.fillStyle = theme === 'city' ? '#3b3e48' : theme === 'desert' ? '#8a6a48' : '#5b5a4c';
    g.fillRect(x0, 0, sh, H);
    // obrubník: červeno-bílý (ve městě žluto-černý)
    const cx = side === 0 ? sh - curb : W - sh;
    const colors = theme === 'city' ? ['#f4c21a', '#17181c'] : ['#d92b2b', '#f1f1f1'];
    for (let k = 0; k < 4; k++) {
      g.fillStyle = colors[k % 2];
      g.fillRect(cx, (k * H) / 4, curb, H / 4);
    }
    // bílá krajová čára
    g.fillStyle = 'rgba(240,240,235,0.92)';
    g.fillRect(side === 0 ? sh + 6 : W - sh - 14, 0, 8, H);
  }
  // přerušované čáry mezi pruhy (při lanes = 2 vyjde přesně středová čára)
  g.fillStyle = theme === 'city' ? 'rgba(255,214,70,0.95)' : 'rgba(240,240,235,0.9)';
  const inner = W - 2 * sh;
  for (let k = 1; k < Math.max(2, Math.round(lanes)); k++) {
    g.fillRect(sh + (inner * k) / Math.max(2, Math.round(lanes)) - 4, 0, 8, H * 0.5);
  }
  speckle(g, W, H, 2500, rnd, 0.05, 0.12);
  return tex(c);
}

/** Hrana dlaždice asfaltu na testovacím placu v metrech (zem se o ni posouvá, aby plac působil nekonečně). */
export const PAD_TILE = 80;

export function groundTexture(theme: ThemeId): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = mulberry(21);
  const base = theme === 'desert' ? '#b9824f' : theme === 'city' ? '#1a1c22' : '#3f6b32';
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const blobs = theme === 'desert' ? ['#c9955d', '#a8703f', '#d0a070'] : theme === 'city' ? ['#20232b', '#15171c', '#262a33'] : ['#4a7a38', '#35602b', '#5a8a3e'];
  for (let i = 0; i < 260; i++) {
    g.fillStyle = blobs[i % blobs.length];
    g.globalAlpha = 0.25 + rnd() * 0.3;
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, 8 + rnd() * 40, 6 + rnd() * 26, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  speckle(g, S, S, 14000, rnd, 0.1, 0.16);
  if (theme === 'city') {
    // dlažba
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo((i * S) / 8, 0); g.lineTo((i * S) / 8, S); g.stroke();
      g.beginPath(); g.moveTo(0, (i * S) / 8); g.lineTo(S, (i * S) / 8); g.stroke();
    }
  }
  return tex(c);
}

/**
 * Testovací plac: asfalt s přerušovanými čarami po celé ploše (nekonečně pruhů).
 * Dlaždice je 80 m: pruh 8 m, čára 4 m + mezera 6 m – obojí dělí 80 beze zbytku, takže napojení není vidět.
 */
export function padTexture(): THREE.CanvasTexture {
  const S = 1024, M = S / PAD_TILE; // pixelů na metr
  const [c, g] = canvas(S, S);
  const rnd = mulberry(33);
  g.fillStyle = '#34373e';
  g.fillRect(0, 0, S, S);
  speckle(g, S, S, 26000, rnd, 0.08, 0.2);
  // praskliny a flekaté záplaty, ať asfalt není jen plocha
  g.globalAlpha = 0.5;
  for (let i = 0; i < 70; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.035)';
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 90, 14 + rnd() * 60, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    let x = rnd() * S, y = rnd() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  // čáry mezi pruhy (vodorovně = podél rovinek); každá pátá je plná, ať je vidět, kam jedeš
  const lane = 8 * M, dash = 4 * M, gap = 6 * M, th = Math.max(2, 0.22 * M);
  for (let k = 0; k * lane <= S; k++) {
    const y = k * lane - th / 2;
    const solid = k % 5 === 0;
    g.fillStyle = solid ? 'rgba(245,245,238,0.75)' : 'rgba(240,240,235,0.9)';
    if (solid) g.fillRect(0, y, S, th);
    else for (let x = 0; x < S; x += dash + gap) g.fillRect(x, y, dash, th);
  }
  return tex(c);
}

/** Svodidlo – betonové bloky s barevným pruhem. */
export function wallTexture(theme: ThemeId): THREE.CanvasTexture {
  const W = 256, H = 64;
  const [c, g] = canvas(W, H);
  const rnd = mulberry(5);
  g.fillStyle = theme === 'city' ? '#2c2f3a' : '#b9b6ad';
  g.fillRect(0, 0, W, H);
  speckle(g, W, H, 1500, rnd, 0.12, 0.2);
  const colors = theme === 'city' ? ['#11131a', '#11131a'] : theme === 'desert' ? ['#d9412b', '#f2efe6'] : ['#1f6fd6', '#f2efe6'];
  g.fillStyle = colors[0]; g.fillRect(0, 8, W / 2, 26);
  g.fillStyle = colors[1]; g.fillRect(W / 2, 8, W / 2, 26);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 3, H); g.fillRect(W / 2, 0, 3, H);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, H - 8, W, 8);
  return tex(c);
}

/** Fasáda s okny. Stejná textura slouží i jako emissive mapa, takže rozsvícená okna svítí. */
export function buildingTexture(seed: number, tint: string): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rnd = mulberry(seed);
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, S, S);
  const cols = 4, rows = 4;
  const cw = S / cols, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const lit = rnd();
      if (lit < 0.42) { g.fillStyle = '#0a0d14'; }
      else {
        const b = 0.5 + rnd() * 0.5;
        g.fillStyle = tint;
        g.globalAlpha = b;
      }
      g.fillRect(k * cw + cw * 0.18, r * rh + rh * 0.22, cw * 0.64, rh * 0.5);
      g.globalAlpha = 1;
    }
  }
  return tex(c);
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 32);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  const t = tex(c, false);
  return t;
}

export function bannerTexture(title: string, sub: string): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 128);
  const gr = g.createLinearGradient(0, 0, 1024, 0);
  gr.addColorStop(0, '#ff3d00'); gr.addColorStop(0.5, '#ffb300'); gr.addColorStop(1, '#ff3d00');
  g.fillStyle = '#0c0d12';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 10); g.fillRect(0, 118, 1024, 10);
  g.font = 'italic 900 70px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = gr;
  g.fillText(title, 512, 56);
  g.font = '700 22px "Segoe UI", Arial, sans-serif';
  g.fillStyle = '#e8e8e8';
  g.fillText(sub, 512, 100);
  return tex(c, false);
}

const PICKUP_COLORS: Record<PickupKind, string> = { repair: '#27d45a', rocket: '#ff3b2f', nitro: '#22b8ff' };
export const PICKUP_HEX: Record<PickupKind, number> = { repair: 0x27d45a, rocket: 0xff3b2f, nitro: 0x22b8ff };

/** Ikona na bedně (klíč / raketa / blesk). */
export function pickupTexture(kind: PickupKind): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#12141b';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = PICKUP_COLORS[kind];
  g.lineWidth = 10;
  g.strokeRect(5, 5, S - 10, S - 10);
  drawPickupIcon(g, kind, S / 2, S / 2, S * 0.3, PICKUP_COLORS[kind]);
  return tex(c, false);
}

export function drawPickupIcon(g: CanvasRenderingContext2D, kind: PickupKind | 'mine' | 'ball' | 'hook', cx: number, cy: number, r: number, color: string) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color; g.strokeStyle = color;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'repair') {
    g.fillRect(-r * 0.28, -r, r * 0.56, r * 2);
    g.fillRect(-r, -r * 0.28, r * 2, r * 0.56);
  } else if (kind === 'nitro') {
    g.beginPath();
    g.moveTo(r * 0.25, -r * 1.1); g.lineTo(-r * 0.6, r * 0.15); g.lineTo(-r * 0.05, r * 0.15);
    g.lineTo(-r * 0.3, r * 1.1); g.lineTo(r * 0.6, -r * 0.25); g.lineTo(r * 0.05, -r * 0.25);
    g.closePath(); g.fill();
  } else if (kind === 'hook') {
    // hák: trojzubec na laně
    g.lineWidth = r * 0.22;
    g.beginPath();
    g.moveTo(-r * 0.75, r * 0.85);
    g.quadraticCurveTo(-r * 0.2, r * 0.1, 0, -r * 0.25);
    g.stroke();
    g.beginPath();
    g.arc(0, -r * 0.3, r * 0.5, Math.PI * 0.15, Math.PI * 0.85, true);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -r * 0.8);
    g.lineTo(0, -r * 0.2);
    g.stroke();
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * r * 0.48, -r * 0.14);
      g.lineTo(sx * r * 0.68, -r * 0.5);
      g.stroke();
    }
  } else if (kind === 'ball') {
    // míčky: tři kuličky vedle sebe
    for (const [ox, oy, rr] of [[-0.5, 0.35, 0.42], [0.52, 0.42, 0.36], [0.06, -0.45, 0.46]] as [number, number, number][]) {
      g.beginPath();
      g.arc(ox * r, oy * r, rr * r, 0, Math.PI * 2);
      g.lineWidth = r * 0.2;
      g.stroke();
      g.beginPath();
      g.arc(ox * r, oy * r, rr * r * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'mine') {
    // mina: šestiúhelník s terčíkem uprostřed
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.lineWidth = r * 0.26;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    g.fill();
  } else {
    // raketa
    g.rotate(-Math.PI / 4);
    g.beginPath();
    g.moveTo(r * 1.15, 0); g.lineTo(r * 0.5, -r * 0.34); g.lineTo(-r * 0.7, -r * 0.34);
    g.lineTo(-r * 1.1, -r * 0.7); g.lineTo(-r * 0.9, 0); g.lineTo(-r * 1.1, r * 0.7);
    g.lineTo(-r * 0.7, r * 0.34); g.lineTo(r * 0.5, r * 0.34);
    g.closePath(); g.fill();
  }
  g.restore();
}

/** Jmenovka nad autem. */
export function nameTagTexture(name: string, color: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.font = '900 34px "Segoe UI", Arial, sans-serif';
  const w = Math.min(240, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(8,9,14,0.72)';
  g.beginPath();
  g.roundRect(128 - w / 2, 10, w, 44, 10);
  g.fill();
  g.fillStyle = color;
  g.fillRect(128 - w / 2, 48, w, 6);
  g.fillStyle = '#fff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 31, 220);
  return tex(c, false);
}

/** Měkký světelný kužel na silnici před autem (noční trať). */
export function headlightTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  // tři měkké skvrny: u auta úzká a jasná, dál širší a slabší (v=0 je u auta)
  const blob = (y: number, r: number, a: number) => {
    const gr = g.createRadialGradient(64, y, 0, 64, y, r);
    gr.addColorStop(0, `rgba(255,244,214,${a})`);
    gr.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 256);
  };
  blob(215, 38, 0.9);
  blob(150, 56, 0.5);
  blob(80, 62, 0.28);
  return tex(c, false);
}

/** Měkký stín pod autem (levná náhrada, když jsou vypnuté stíny). */
export function blobTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}
