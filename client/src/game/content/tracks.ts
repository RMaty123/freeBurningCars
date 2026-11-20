/**
 * Seznam tratí. Novou trať přidáš dalším záznamem do pole TRACKS – ve výběru tratě se objeví sama
 * (karta, náhled i obrys se generují z těchhle dat).
 *
 *   points     řídicí body [x, z] v metrech; křivka se sama uzavře
 *   elevation  výška bodů v metrech (stejný počet jako points); vynech = rovná trať
 *   theme      prostředí: 'desert' | 'city' | 'forest' | 'airport' (vzhled je v render/world.ts)
 *   lanes      na kolik pruhů se vozovka rozdělí čarami (nepovinné, výchozí 2)
 *
 * Zatáčky drž s poloměrem aspoň ~25 m a jednotlivé úseky aspoň ~40 m od sebe.
 * Výškové rozdíly drž do ~10 %, ať auta nejezdí po schodech.
 */
import type { ThemeId, TrackDef } from '../track';

export const THEME_LABEL: Record<ThemeId, string> = {
  desert: 'Poušť',
  city: 'Noční město',
  forest: 'Hory a les',
  airport: 'Opuštěné letiště',
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
    /*
     * Opuštěné letiště v noci. Nejdřív se jede po vyvýšené cestě k terminálu (10 m),
     * pak trať vjede do parkovacího domu a stoupá v něm po patrech:
     *   patro 1 (10 m) dlouhá rovinka na jednu stranu → 180° otočka
     *   → patro 2 (16 m) dlouhá rovinka zpátky → druhá 180° otočka
     *   → patro 3 (22 m) dlouhá rovinka k výjezdu → rampa a seskok z budovy dolů
     *   → runway na jihu → pozvolný výjezd zpátky k terminálu.
     * Patra jsou od sebe 6 m, takže je v hale vysoký strop a je vidět přes celé podlaží.
     * Výšky jsou v metrech a musí jich být přesně tolik co bodů.
     */
    id: 'airport',
    name: 'GHOST RUNWAY',
    tagline: 'Noční letiště. Otevřená garáž po patrech, dvě otočky, seskok z rampy a runway.',
    theme: 'airport',
    width: 22,
    lanes: 3,
    points: [
      // příjezd k terminálu a vjezd do garáže (10 m)
      [-80, 0], [40, 0], [130, -2], [158, -10], [174, -30], [180, -58],
      // dlouhá rovinka v 1. patře
      [180, -120], [180, -185],
      // 1. otočka: patro 1 → patro 2 (10 → 16 m)
      [185.9, -199.1], [200, -205], [214.1, -199.1], [220, -185],
      // dlouhá rovinka ve 2. patře zpátky na druhou stranu budovy
      [220, -140], [220, -100], [220, -81],
      // 2. otočka: patro 2 → patro 3 (16 → 22 m)
      [225.9, -66.9], [240, -61], [254.1, -66.9], [260, -81],
      // dlouhá rovinka ve 3. patře a výjezd z budovy
      [260, -130], [260, -175], [260, -205],
      [268, -225], [282, -236], [300, -240], [318, -236], [332, -225], [344, -208],
      // rozjezdová rampa, hrana a seskok na zem
      [344, -184], [344, -135], [344, -90], [344, -45],
      // jižní apron a dlouhá runway
      [346, 20], [350, 120], [352, 220], [348, 310], [330, 375], [280, 408], [190, 418],
      [80, 415], [-40, 412], [-160, 411], [-270, 400],
      // západní objezd a výjezd zpátky k terminálu
      [-325, 355], [-332, 300], [-332, 250], [-320, 195], [-292, 145], [-250, 95],
      [-200, 55], [-150, 25], [-115, 8],
    ],
    elevation: [
      10, 10, 10, 10, 10, 10,
      10, 10,
      11.5, 13, 14.5, 16,
      16, 16, 16,
      17.5, 19, 20.5, 22,
      22, 22, 22,
      22.5, 23, 23.6, 24.2, 24.7, 25.1,
      25.6, 9.5, 2.6, 0.4,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0.5, 1.5, 3, 5, 7, 9, 10, 10, 10,
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
