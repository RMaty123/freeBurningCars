/**
 * Rychlá kontrola geometrie všech tratí: délka, výšky, sklony a to, jak blízko
 * k sobě vedou různé úseky. Spouští se ručně: npx tsx scripts/trackcheck.ts
 */
import { TRACKS } from '../client/src/game/content/tracks';
import { buildTrack } from '../client/src/game/track';

for (const def of TRACKS) {
  const tr = buildTrack(def);
  let minY = Infinity, maxY = -Infinity, maxGrade = 0;
  for (let i = 0; i < tr.n; i++) {
    minY = Math.min(minY, tr.y[i]);
    maxY = Math.max(maxY, tr.y[i]);
    maxGrade = Math.max(maxGrade, Math.abs(tr.grade[i]));
  }
  // nejmenší vzdálenost dvou vzorků, které od sebe po trati nejsou blízko
  let minD = Infinity, at: [number, number] = [0, 0];
  for (let i = 0; i < tr.n; i += 2) {
    for (let j = i + 20; j < tr.n; j += 2) {
      if (tr.n - j + i < 20) continue;
      const d = Math.hypot(tr.x[i] - tr.x[j], tr.z[i] - tr.z[j]);
      if (d < minD) { minD = d; at = [i, j]; }
    }
  }
  console.log(
    `${def.id.padEnd(10)} délka ${tr.length.toFixed(0).padStart(5)} m  výška ${minY.toFixed(1)}…${maxY.toFixed(1)} m  ` +
      `max sklon ${(maxGrade * 100).toFixed(0)} %  nejblíž k sobě ${minD.toFixed(1)} m (${at[0]}/${at[1]})`,
  );
}
