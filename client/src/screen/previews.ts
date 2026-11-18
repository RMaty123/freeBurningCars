/**
 * Náhledy tratí pro karty ve výběru tratě.
 * Každá trať se jednou opravdu vyrenderuje herním enginem (auta na trati) a obrázek se uloží
 * do localStorage, takže příští spuštění už nic negeneruje. Nová trať v content/tracks.ts
 * dostane náhled sama.
 */
import { TRACKS } from '../game/content/tracks';
import type { App } from './app';

/** Zvyš, když změníš vzhled hry a chceš náhledy vygenerovat znovu. */
const PREVIEW_VERSION = 2;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function keyFor(i: number): string {
  const d = TRACKS[i];
  return `fbc-preview-${PREVIEW_VERSION}-${d.id}-${hash(JSON.stringify([d.theme, d.width, d.points]))}`;
}

/**
 * Vrátí náhledy všech tratí (id → data URL). Chybějící vygeneruje.
 * Trať `keepIdx` se generuje poslední, takže její svět zůstane načtený pro menu.
 */
export function loadPreviews(app: App, keepIdx: number): Map<string, string> {
  const out = new Map<string, string>();
  const missing: number[] = [];
  TRACKS.forEach((d, i) => {
    if (d.open) return; // testovací plac má schematický náhled, nic se nerenderuje
    let url: string | null = null;
    try { url = localStorage.getItem(keyFor(i)); } catch { /* localStorage může být vypnutý */ }
    if (url) out.set(d.id, url); else missing.push(i);
  });
  missing.sort((a, b) => Number(a === keepIdx) - Number(b === keepIdx));
  for (const i of missing) {
    app.loadWorld(i);
    const sim = app.attractSim(i, 4242 + i);
    app.view.setSim(sim, []);
    const url = app.view.snapshot(sim);
    out.set(TRACKS[i].id, url);
    try { localStorage.setItem(keyFor(i), url); } catch { /* plné úložiště – náhled se příště vygeneruje znovu */ }
  }
  // úklid náhledů od starších verzí / smazaných tratí
  try {
    const valid = new Set(TRACKS.map((_, i) => keyFor(i)));
    for (let k = localStorage.length - 1; k >= 0; k--) {
      const key = localStorage.key(k);
      if (key?.startsWith('fbc-preview-') && !valid.has(key)) localStorage.removeItem(key);
    }
  } catch { /* nevadí */ }
  return out;
}
