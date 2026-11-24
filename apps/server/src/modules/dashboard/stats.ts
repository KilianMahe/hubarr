// SPDX-License-Identifier: AGPL-3.0-or-later
// Statistiques du tableau de bord (lot 13, admins) : fonctions pures, testées.
//
// - Téléchargements par jour : somme des tailles des éléments terminés, par
//   jour de fin dans le fuseau d'affichage, sur `DOWNLOAD_STATS_DAYS` jours.
//   Les données viennent de la liste actuelle des clients (torrents terminés,
//   historique Usenet réussi) : rien n'est stocké.
// - Espace disque : disques de `/diskspace` qui portent au moins un dossier
//   racine (point de montage le plus long qui préfixe le dossier),
//   dédoublonnés entre instances.

import {
  DISK_ALERT_PERCENT,
  DOWNLOAD_STATS_DAYS,
  addDays,
  dayInZone,
  type DashboardDisks,
} from '@hubarr/shared';

/** Élément terminé : fin (secondes Unix) et taille (octets). */
export interface CompletedItem {
  completedAt: number | null;
  bytes: number;
}

/** Octets par jour de fin, des `days` derniers jours (aujourd'hui compris), du plus ancien au plus récent. */
export function bytesPerDay(
  items: readonly CompletedItem[],
  today: string,
  timezone: string,
  days = DOWNLOAD_STATS_DAYS,
): { day: string; bytes: number }[] {
  const first = addDays(today, -(days - 1));
  const totals = new Map<string, number>();
  for (let i = 0; i < days; i += 1) totals.set(addDays(first, i), 0);
  for (const item of items) {
    if (item.completedAt === null || item.completedAt <= 0 || !(item.bytes > 0)) continue;
    const day = dayInZone(item.completedAt * 1000, timezone);
    const current = day === null ? undefined : totals.get(day);
    if (day !== null && current !== undefined) totals.set(day, current + item.bytes);
  }
  return [...totals.entries()].map(([day, bytes]) => ({ day, bytes }));
}

/** Début (secondes Unix) de la période : un jour de marge pour les fuseaux. */
export function periodStart(nowMs: number, days = DOWNLOAD_STATS_DAYS): number {
  return Math.floor(nowMs / 1000) - (days + 1) * 86_400;
}

/** Disque tel que renvoyé par `/api/v3/diskspace`. */
export interface ArrDisk {
  path?: string | null;
  label?: string | null;
  freeSpace?: number;
  totalSpace?: number;
}

/** Disques et dossiers racines d'une instance Radarr ou Sonarr. */
export interface InstanceDisks {
  service: 'radarr' | 'sonarr';
  instance: string;
  disks: readonly ArrDisk[];
  roots: readonly string[];
}

type Disk = DashboardDisks['disks'][number];

const trimSlash = (path: string) => (path.length > 1 ? path.replace(/[/\\]+$/, '') : path);

/** Le dossier est-il sur ce point de montage ? (`/data` porte `/data/films`, pas `/database`.) */
function contains(mount: string, folder: string): boolean {
  const m = trimSlash(mount);
  const f = trimSlash(folder);
  if (m === '/' || m === '') return true;
  return f === m || f.startsWith(`${m}/`) || f.startsWith(`${m}\\`);
}

/** Point de montage d'un dossier : le plus long qui le contient. */
export function mountOf<T extends ArrDisk>(folder: string, disks: readonly T[]): T | null {
  let best: T | null = null;
  for (const disk of disks) {
    const path = disk.path ?? '';
    if (path === '' || !contains(path, folder)) continue;
    if (best === null || trimSlash(path).length > trimSlash(best.path ?? '').length) best = disk;
  }
  return best;
}

/** Écart d'espace libre toléré pour reconnaître un même disque vu par deux instances. */
const SAME_DISK_FREE_TOLERANCE = 1_073_741_824;

/**
 * Disques portant au moins un dossier racine, dédoublonnés : même chemin, ou
 * même taille totale et espace libre à 1 Gio près (le même disque monté à des
 * chemins différents dans les conteneurs Radarr et Sonarr). Les plus remplis
 * d'abord.
 */
export function diskUsage(instances: readonly InstanceDisks[]): Disk[] {
  const result: Disk[] = [];
  for (const source of instances) {
    for (const root of source.roots) {
      const disk = mountOf(root, source.disks);
      if (disk === null) continue;
      const totalSpace = disk.totalSpace ?? 0;
      const freeSpace = disk.freeSpace ?? 0;
      if (totalSpace <= 0) continue;
      const path = disk.path ?? '';
      const existing = result.find(
        (d) =>
          d.path === path ||
          (d.totalSpace === totalSpace &&
            Math.abs(d.freeSpace - freeSpace) <= SAME_DISK_FREE_TOLERANCE),
      );
      const entry = { service: source.service, instance: source.instance, path: root };
      if (existing) {
        const known = existing.roots.some(
          (r) => r.service === entry.service && r.instance === entry.instance && r.path === root,
        );
        if (!known) existing.roots.push(entry);
        continue;
      }
      const usedPercent = Math.round(((totalSpace - freeSpace) / totalSpace) * 1000) / 10;
      result.push({
        path,
        label: disk.label ?? null,
        freeSpace,
        totalSpace,
        usedPercent,
        alert: usedPercent > DISK_ALERT_PERCENT,
        roots: [entry],
      });
    }
  }
  return result.sort((a, b) => b.usedPercent - a.usedPercent);
}
