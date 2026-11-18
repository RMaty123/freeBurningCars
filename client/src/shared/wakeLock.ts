/**
 * Drží obrazovku rozsvícenou, dokud je stránka vidět.
 *
 * Proč: při hraní se myš ani klávesnice třeba několik minut nehnou (auto jede samo,
 * ovládáš ho z telefonu) a počítač si zhasne obrazovku nebo pustí spořič.
 *
 * Hlavní cesta je **Screen Wake Lock API**. Funguje jen v "bezpečném kontextu",
 * což `http://localhost:3000` na počítači splňuje. Telefon se připojuje přes
 * `http://192.168.x.x`, kde API není – tam se použije záloha: němé video z plátna,
 * které si systém vyloží jako puštěné video a obrazovku nechá svítit.
 *
 * Zámek se sám uvolní, když se okno schová (jiná záložka, minimalizace), proto si
 * ho bereme znovu při každém návratu.
 */

type Sentinel = { release(): Promise<void>; addEventListener(t: string, cb: () => void): void };

let lock: Sentinel | null = null;
let video: HTMLVideoElement | null = null;
let started = false;

/** Němé video z plátna – záloha tam, kde Wake Lock není (telefon na http). */
function videoFallback() {
  if (video) {
    void video.play().catch(() => {});
    return;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const ctx = c.getContext('2d');
  const stream = (c as HTMLCanvasElement & { captureStream?(fps: number): MediaStream }).captureStream?.(2);
  if (!ctx || !stream) return;
  // plátno se musí pořád trochu měnit, jinak stream "usne" a video se zastaví
  let flip = false;
  setInterval(() => {
    flip = !flip;
    ctx.fillStyle = flip ? '#000000' : '#010101';
    ctx.fillRect(0, 0, 2, 2);
  }, 1000);

  video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  Object.assign(video.style, {
    position: 'fixed', left: '0', bottom: '0', width: '1px', height: '1px',
    opacity: '0', pointerEvents: 'none', zIndex: '-1',
  });
  video.srcObject = stream;
  document.body.appendChild(video);
  void video.play().catch(() => {});
}

async function acquire() {
  if (document.visibilityState !== 'visible' || lock) return;
  const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
  if (!wl) { videoFallback(); return; }
  try {
    lock = await wl.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch {
    // zamítnuto (např. vybitá baterie nebo starší prohlížeč) – zkusíme zálohu
    lock = null;
    videoFallback();
  }
}

/**
 * Zapne držení obrazovky. Volá se jednou při startu stránky; o zbytek
 * (návrat z jiné záložky, první klik) se postará sama.
 */
export function keepScreenAwake() {
  if (started) return;
  started = true;
  void acquire();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
  });
  // některé prohlížeče pustí zámek i video až po prvním doteku / klávese
  const kick = () => { void acquire(); if (video) void video.play().catch(() => {}); };
  addEventListener('pointerdown', kick, { passive: true });
  addEventListener('keydown', kick);
}
