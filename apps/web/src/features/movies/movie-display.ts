// SPDX-License-Identifier: AGPL-3.0-or-later
// Affichage d'un film de la bibliothèque : URL d'affiche à la bonne taille,
// infobulle de la pastille de statut, ligne de métadonnées.

import { formatGb } from '../../app/format';
import type { MovieLibraryItem } from '@hubarr/shared';
import { displayStatusOf } from './library';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/**
 * Affiche TMDB à la taille voulue : Radarr renvoie l'original (plusieurs Mo),
 * inutile pour une vignette. Une autre URL est rendue telle quelle.
 */
export function posterUrl(
  url: string | null,
  size: 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280',
): string | null {
  if (url === null || url === '') return null;
  return url.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)original\//, `$1${size}/`);
}

/** Infobulle de la pastille (`media.films.status.*` de la carte d'origine). */
export function statusTitle(
  t: Translate,
  movie: Pick<MovieLibraryItem, 'hasFile' | 'monitored' | 'status'>,
): string {
  switch (displayStatusOf(movie)) {
    case 'downloaded':
      return t('media.films.status.downloaded');
    case 'unavailable':
      return t('media.films.status.monitored_indisp', {
        status: t(
          movie.status === 'inCinemas'
            ? 'media.films.status.in_cinemas_lc'
            : 'media.films.status.announced_lc',
        ),
      });
    case 'missing':
      return t('media.films.status.monitored_missing');
    case 'unmonitored':
      return t('media.films.status.unmonitored');
  }
}

/** Taille (`12.4 Go`, `1.2 To` au-delà de 1 024 Go, V29), ou `null` sans fichier. */
export function sizeText(_t: Translate, sizeGb: number | null): string | null {
  return sizeGb === null || sizeGb <= 0 ? null : formatGb(sizeGb);
}

/** Ligne secondaire : année · durée · taille. */
export function metaLine(
  t: Translate,
  movie: Pick<MovieLibraryItem, 'year' | 'runtime' | 'sizeGb'>,
): string {
  return [
    movie.year === null ? null : String(movie.year),
    movie.runtime ? `${movie.runtime} min` : null,
    sizeText(t, movie.sizeGb),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
