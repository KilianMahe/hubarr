// SPDX-License-Identifier: AGPL-3.0-or-later
// Langues présentes et manquantes d'un film ou d'un épisode Bazarr : port de
// `BazarrLangs` (`BazarrLangsTest`). Tolérant aux formes des versions de
// Bazarr : libellé `code2`, `code3` ou `name`, drapeau `hi` ou
// `hearing_impaired`, entrée en tuple `[code2, chemin]` ou en simple texte ;
// une entrée illisible est ignorée.

import type { BazarrLang, BazarrLangs } from '@hubarr/shared';

function mapEntry(entry: unknown): BazarrLang | null {
  if (Array.isArray(entry) || (typeof entry === 'object' && entry !== null)) {
    const record = entry as Record<string | number, unknown>;
    let label: unknown = record.code2 ?? record.code3 ?? record.name ?? null;
    if (label === null && Array.isArray(entry)) label = entry[0] ?? null;
    const text = typeof label === 'string' ? label.trim() : '';
    if (text === '') return null;
    return {
      lang: text,
      hi: Boolean(record.hi ?? record.hearing_impaired ?? false),
      forced: Boolean(record.forced ?? false),
    };
  }
  if (typeof entry === 'string' && entry.trim() !== '') {
    return { lang: entry.trim(), hi: false, forced: false };
  }
  return null;
}

function mapList(entries: unknown): BazarrLang[] {
  return Array.isArray(entries) ? entries.flatMap((entry) => mapEntry(entry) ?? []) : [];
}

export function extractLangs(dict: Record<string, unknown>): BazarrLangs {
  return { present: mapList(dict.subtitles), missing: mapList(dict.missing_subtitles) };
}
