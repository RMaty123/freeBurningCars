/**
 * Seznam tratí. Novou trať přidáš dalším záznamem do pole TRACKS – ve výběru tratě se objeví sama
 * (karta, náhled i obrys se generují z těchhle dat).
 *
 *   points  řídicí body [x, z] v metrech; křivka se sama uzavře
 *   theme   prostředí: 'desert' | 'city' | 'forest' (vzhled je v render/world.ts)
 *
 * Zatáčky drž s poloměrem aspoň ~25 m a jednotlivé úseky aspoň ~40 m od sebe.
 */
import type { ThemeId, TrackDef } from '../track';

export const THEME_LABEL: Record<ThemeId, string> = {
  desert: 'Poušť',
  city: 'Noční město',
  forest: 'Hory a les',
};

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
];
