/**
 * Seznam tratí. Novou trať přidáš dalším záznamem do pole TRACKS – ve výběru tratě se objeví sama
 * (karta, náhled i obrys se generují z těchhle dat).
 *
 *   points  řídicí body [x, z] v metrech; křivka se sama uzavře
 *   theme   prostředí: 'desert' | 'city' | 'forest' (vzhled je v render/world.ts)
 *   lanes   na kolik pruhů se vozovka rozdělí čarami (nepovinné, výchozí 2)
 *
 * Zatáčky drž s poloměrem aspoň ~25 m a jednotlivé úseky aspoň ~40 m od sebe.
 */
import type { ThemeId, TrackDef } from '../track';

export const THEME_LABEL: Record<ThemeId, string> = {
  desert: 'Poušť',
  city: 'Noční město',
  forest: 'Hory a les',
};

/**
 * Body obrovského oválu: dvě dlouhé rovinky spojené půlkruhy.
 * Start je na začátku horní rovinky, aby se vyjíždělo rovně.
 */
function oval(straight: number, radius: number, arcPts = 8): [number, number][] {
  const pts: [number, number][] = [];
  const line = (x0: number, x1: number, z: number) => {
    for (let i = 0; i <= 4; i++) pts.push([x0 + ((x1 - x0) * i) / 4, z]);
  };
  const arc = (cx: number, from: number) => {
    for (let i = 1; i < arcPts; i++) {
      const a = from - (i / arcPts) * Math.PI;
      pts.push([cx + Math.cos(a) * radius, Math.sin(a) * radius]);
    }
  };
  line(-straight / 2, straight / 2, radius);   // horní rovinka
  arc(straight / 2, Math.PI / 2);              // pravá zatáčka
  line(straight / 2, -straight / 2, -radius);  // dolní rovinka
  arc(-straight / 2, -Math.PI / 2);            // levá zatáčka
  return pts;
}

export const TRACKS: TrackDef[] = [
  {
    id: 'canyon',
    name: 'SUNSET CANYON',
    tagline: 'Rychlé táhlé zatáčky mezi skalami při západu slunce.',
    theme: 'desert',
    width: 17,
    points: [
      [0, 0], [120, 0], [220, -12], [292, -72], [300, -165], [240, -228], [150, -212], [96, -150],
      [28, -128], [-42, -180], [-62, -270], [-150, -305], [-242, -252], [-262, -150], [-204, -78],
      [-212, 8], [-130, 42],
    ],
  },
  {
    id: 'neon',
    name: 'NEON CITY',
    tagline: 'Pravoúhlé ulice nočního města. Brzdi včas.',
    theme: 'city',
    width: 16,
    points: [
      [0, 0], [170, 0], [262, 0], [300, -38], [300, -128], [262, -166], [176, -166], [138, -204],
      [138, -296], [100, -334], [-70, -334], [-108, -296], [-108, -226], [-146, -188], [-236, -188],
      [-274, -150], [-274, -38], [-236, 0], [-120, 0],
    ],
  },
  {
    id: 'alpine',
    name: 'ALPINE RUSH',
    tagline: 'Plynulá horská trať lesem pod zasněženými štíty.',
    theme: 'forest',
    width: 16,
    points: [
      [0, 0], [115, 8], [205, 60], [262, 150], [242, 252], [150, 292], [70, 244], [18, 172],
      [-62, 160], [-124, 222], [-212, 242], [-292, 182], [-302, 80], [-242, 10], [-150, 18], [-88, -28],
    ],
  },
  {
    // testovací plac – zůstává poslední v nabídce
    id: 'teststrip',
    name: 'TEST STRIP',
    tagline: 'Nekonečný asfalt do všech stran, nekonečně pruhů. Na zkoušení aut a přestřelky.',
    theme: 'desert',
    width: 64,
    lanes: 8,
    open: true,
    points: oval(1300, 190),
  },
];
