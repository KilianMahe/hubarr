// SPDX-License-Identifier: AGPL-3.0-or-later
// Outils communs des clients d'activité (P3e.1) : lecture tolérante des
// valeurs, code d'épisode, contrôle du type des images proxifiées
// (`ProxiedImage`), activité vide.

import type { Activity } from '@hubarr/shared';

/** Texte sans espaces autour ; vide, tableau, booléen ou absent → `null` (`str` de l'original). */
export function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
    return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

export function int(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function float(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

export function isNumeric(value: unknown): boolean {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
  );
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null && !Array.isArray(row),
      )
    : [];
}

export function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => text(item) ?? []) : [];
}

/** « S01E02 » pour un épisode, « E02 » sans saison, sinon `null`. */
export function episodeCode(
  mediaType: string | null,
  season: unknown,
  episode: unknown,
): string | null {
  if (mediaType !== 'episode' || !isNumeric(episode)) return null;
  const ep = `E${String(int(episode)).padStart(2, '0')}`;
  return isNumeric(season) ? `S${String(int(season)).padStart(2, '0')}${ep}` : ep;
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

const RASTER_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
]);

/** Type d'image matricielle normalisé, ou `null` (SVG et autres refusés). */
export function rasterContentType(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? (header[0] ?? '') : (header ?? '');
  let type = (raw.split(';')[0] ?? '').trim().toLowerCase();
  if (type === 'image/jpg') type = 'image/jpeg';
  return RASTER_TYPES.has(type) ? type : null;
}

export interface ProxiedImage {
  body: Uint8Array;
  contentType: string;
}

export function emptyActivity(enabled: boolean, configured: boolean, bandwidth: boolean): Activity {
  return {
    enabled,
    configured,
    connected: false,
    error: null,
    streamCount: 0,
    directPlayCount: 0,
    directStreamCount: 0,
    transcodeCount: 0,
    bandwidth: bandwidth ? { totalKbps: 0, lanKbps: 0, wanKbps: 0 } : null,
    totalBitrate: null,
    sessions: [],
  };
}
