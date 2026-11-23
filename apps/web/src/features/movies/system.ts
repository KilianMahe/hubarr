// SPDX-License-Identifier: AGPL-3.0-or-later
// Affichage de la page système *arr : occupation des disques, couleurs de la
// santé et des niveaux de journal.

const GIB = 1_073_741_824;

export interface DiskUsage {
  pct: number;
  freeGb: number;
  totalGb: number;
  color: 'error' | 'warning' | 'service';
}

/** Occupation d'un disque comme l'original (Go au dixième, rouge > 90 %, orange > 75 %). */
export function diskUsage(disk: { freeSpace: number; totalSpace: number }): DiskUsage {
  const used = disk.totalSpace - disk.freeSpace;
  const pct = disk.totalSpace > 0 ? Math.round((used / disk.totalSpace) * 100) : 0;
  return {
    pct,
    freeGb: Math.round((disk.freeSpace / GIB) * 10) / 10,
    totalGb: Math.round((disk.totalSpace / GIB) * 10) / 10,
    color: pct > 90 ? 'error' : pct > 75 ? 'warning' : 'service',
  };
}

export function healthColor(type: string): string {
  if (type === 'error') return 'error';
  return type === 'warning' ? 'warning' : 'info';
}

export function logColor(level: string): string | undefined {
  if (level === 'error' || level === 'fatal') return 'error';
  if (level === 'warn' || level === 'warning') return 'warning';
  return level === 'debug' ? undefined : 'info';
}
