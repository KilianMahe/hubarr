// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique de la fiche film (`#modal-film` d'origine), sortie des composants pour
// être testée : notes, badges de statut, informations techniques, équipe
// dédoublonnée, libellés d'historique, détection des modifications d'un fichier.

import {
  FILE_LANGUAGE_CHOICES,
  type ArrNamedItem,
  type ArrRelease,
  type MovieCredit,
  type MovieDetail,
  type MovieFile,
  type MovieHistoryItem,
  type MovieQueueItem,
} from '@hubarr/shared';

/** Votes abrégés comme l'original (`1.2M`, `3.4k`). */
export function formatVotes(votes: number): string {
  if (votes >= 1_000_000) return `${(votes / 1_000_000).toFixed(1)}M`;
  if (votes >= 1_000) return `${(votes / 1_000).toFixed(1)}k`;
  return String(votes);
}

export interface Ratings {
  imdb: string | null;
  tmdb: string | null;
}

/** Note IMDb sur 10 (avec les votes) et TMDB en pourcentage ; `null` si absente. */
export function ratingsOf(
  movie: Pick<MovieDetail, 'ratingsImdb' | 'ratingsImdbVotes' | 'ratingsTmdb'>,
): Ratings {
  const imdb =
    movie.ratingsImdb !== null && movie.ratingsImdb > 0
      ? movie.ratingsImdb.toFixed(1) +
        (movie.ratingsImdbVotes ? ` (${formatVotes(movie.ratingsImdbVotes)})` : '')
      : null;
  const tmdb =
    movie.ratingsTmdb !== null && movie.ratingsTmdb > 0
      ? `${(movie.ratingsTmdb * 10).toFixed(0)}%`
      : null;
  return { imdb, tmdb };
}

/** Durée `2h 16min` (ou `45min`), vide si inconnue (`formatRuntime` d'origine). */
export function formatRuntime(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}min` : `${rest}min`;
}

export type BadgeKind = 'monitored' | 'unmonitored' | 'downloaded' | 'unavailable' | 'missing';

/** Badges de statut de la colonne gauche, dans l'ordre de l'original. */
export function statusBadges(
  movie: Pick<MovieDetail, 'monitored' | 'hasFile' | 'status'>,
): BadgeKind[] {
  const badges: BadgeKind[] = [movie.monitored ? 'monitored' : 'unmonitored'];
  if (movie.hasFile) badges.push('downloaded');
  else if (movie.monitored && (movie.status === 'announced' || movie.status === 'inCinemas'))
    badges.push('unavailable');
  else badges.push('missing');
  return badges;
}

export type TechKey =
  | 'path'
  | 'quality'
  | 'video'
  | 'hdr'
  | 'audio'
  | 'languages'
  | 'subtitles'
  | 'size'
  | 'group'
  | 'formats';

export interface TechRow {
  key: TechKey;
  /** Texte simple ; `chips` pour les listes (langues, formats). */
  text?: string;
  chips?: string[];
  /** Score des formats personnalisés (`+120`). */
  score?: string;
  bytes?: number;
}

/** Lignes du tableau « Informations du fichier » (seulement les champs connus). */
export function techRows(movie: Pick<MovieDetail, 'hasFile' | 'movieFile'>): TechRow[] {
  const file = movie.movieFile;
  if (!movie.hasFile || file === null) return [];
  const info = file.mediaInfo;
  const rows: TechRow[] = [];
  if (file.relativePath) rows.push({ key: 'path', text: file.relativePath });
  if (file.quality) rows.push({ key: 'quality', chips: [file.quality] });
  if (info?.videoCodec) {
    rows.push({
      key: 'video',
      text: [
        info.videoCodec,
        info.resolution,
        info.videoFps ? `${info.videoFps.toFixed(0)}fps` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  if (info?.videoDynamicRange) {
    rows.push({
      key: 'hdr',
      text: [info.videoDynamicRange, info.videoBitDepth ? `${info.videoBitDepth}bits` : null]
        .filter(Boolean)
        .join(' · '),
    });
  }
  if (info?.audioCodec) {
    rows.push({
      key: 'audio',
      text: [info.audioCodec, info.audioChannels ? `${info.audioChannels}ch` : null]
        .filter(Boolean)
        .join(' · '),
    });
  }
  if (file.languages.length > 0) rows.push({ key: 'languages', chips: file.languages });
  if (info?.subtitles) rows.push({ key: 'subtitles', text: info.subtitles });
  if (file.size) rows.push({ key: 'size', bytes: file.size });
  if (file.releaseGroup) rows.push({ key: 'group', text: file.releaseGroup });
  if (file.customFormats.length > 0) {
    rows.push({
      key: 'formats',
      chips: file.customFormats,
      ...(file.customFormatScore ? { score: `+${file.customFormatScore}` } : {}),
    });
  }
  return rows;
}

/** Ordre des postes de l'équipe (les autres après, dans l'ordre reçu). */
const JOB_ORDER: Record<string, number> = {
  Director: 0,
  Screenplay: 1,
  Writer: 2,
  Producer: 3,
  'Executive Producer': 4,
  'Director of Photography': 5,
};

export interface CrewEntry {
  person: MovieCredit;
  /** Postes de la personne (`Director, Writer`). */
  jobs: string[];
}

/** 15 premiers acteurs (ordre de Radarr). */
export function castOf(credits: readonly MovieCredit[], limit = 15): MovieCredit[] {
  return credits.filter((credit) => credit.type === 'cast').slice(0, limit);
}

/** Équipe dédoublonnée par personne, postes regroupés, triée par poste ; 15 au plus. */
export function crewOf(credits: readonly MovieCredit[], limit = 15): CrewEntry[] {
  const crew = credits
    .filter((credit) => credit.type === 'crew')
    .map((credit, index) => ({ credit, index }))
    .sort(
      (a, b) =>
        (JOB_ORDER[a.credit.job ?? ''] ?? 99) - (JOB_ORDER[b.credit.job ?? ''] ?? 99) ||
        a.index - b.index,
    );
  const byPerson = new Map<string, CrewEntry>();
  const entries: CrewEntry[] = [];
  for (const { credit } of crew) {
    const key =
      credit.personTmdbId === null ? `n:${credit.personName}` : `t:${credit.personTmdbId}`;
    const job = credit.job ?? credit.department ?? '';
    const existing = byPerson.get(key);
    if (existing) existing.jobs.push(job);
    else {
      const entry = { person: credit, jobs: [job] };
      byPerson.set(key, entry);
      entries.push(entry);
    }
  }
  return entries.slice(0, limit);
}

/** Clé i18n du libellé d'un évènement d'historique (le type brut à défaut). */
export function historyEventKey(eventType: string): string | null {
  const keys: Record<string, string> = {
    grabbed: 'media.films.detail.ev_grabbed',
    downloadFolderImported: 'media.films.detail.ev_imported',
    downloadFailed: 'media.films.detail.ev_download_failed',
    movieFileDeleted: 'media.films.detail.ev_file_deleted',
    movieFolderImported: 'media.films.detail.ev_movie_imported',
    movieImported: 'media.films.detail.ev_movie_imported',
    movieFileRenamed: 'media.films.detail.ev_file_renamed',
  };
  return keys[eventType] ?? null;
}

export type HistoryTone = 'info' | 'success' | 'error' | 'warning' | 'muted';

export function historyTone(eventType: string): HistoryTone {
  switch (eventType) {
    case 'grabbed':
      return 'info';
    case 'downloadFolderImported':
    case 'movieFolderImported':
      return 'success';
    case 'downloadFailed':
      return 'error';
    case 'movieFileDeleted':
      return 'warning';
    default:
      return 'muted';
  }
}

// ── Gestionnaire de fichiers ────────────────────────────────────────────────

export interface FileDraft {
  qualityId: number;
  releaseGroup: string;
  languageIds: number[];
}

export function draftOf(file: MovieFile): FileDraft {
  return {
    qualityId: file.quality?.id ?? 0,
    releaseGroup: file.releaseGroup ?? '',
    languageIds: file.languages.map((language) => language.id).sort((a, b) => a - b),
  };
}

/** Le brouillon diffère-t-il du fichier (le bouton « Sauvegarder » n'apparaît qu'alors) ? */
export function isDirty(file: MovieFile, draft: FileDraft): boolean {
  const original = draftOf(file);
  const ids = [...draft.languageIds].sort((a, b) => a - b);
  return (
    original.qualityId !== draft.qualityId ||
    original.releaseGroup !== draft.releaseGroup ||
    original.languageIds.join(',') !== ids.join(',')
  );
}

/** Langues proposées : la liste d'origine, plus celles déjà portées par le fichier. */
export function languageChoices(file: MovieFile): ArrNamedItem[] {
  const known = new Set(FILE_LANGUAGE_CHOICES.map((language) => language.id));
  return [
    ...FILE_LANGUAGE_CHOICES,
    ...file.languages.filter((language) => !known.has(language.id)),
  ];
}

/** Liste de qualités qui contient toujours la qualité actuelle du fichier. */
export function qualityChoicesFor(
  file: MovieFile,
  qualities: readonly ArrNamedItem[],
): ArrNamedItem[] {
  if (file.quality === null || qualities.some((quality) => quality.id === file.quality?.id))
    return [...qualities];
  return [file.quality, ...qualities];
}

// ── Bilan de la recherche automatique (P2.5) ────────────────────────────────

export type SearchOutcome =
  | { kind: 'queue'; title: string; status: string }
  | { kind: 'grabbed'; indexer: string }
  | { kind: 'none' };

/**
 * Après la commande : le film est-il dans la file, ou un grab récent (moins de
 * 2 min) figure-t-il dans son historique ? Sinon, on interroge les indexeurs.
 */
export function searchOutcome(
  movieId: number,
  history: readonly MovieHistoryItem[],
  queue: readonly MovieQueueItem[],
  now = Date.now(),
): SearchOutcome {
  const queued = queue.find((item) => item.movieId === movieId);
  if (queued) return { kind: 'queue', title: queued.title, status: queued.status || 'downloading' };
  const grab = history.find(
    (item) =>
      item.eventType === 'grabbed' && item.date !== null && now - Date.parse(item.date) < 120_000,
  );
  if (grab) return { kind: 'grabbed', indexer: grab.indexer ?? '?' };
  return { kind: 'none' };
}

/** Étape affichée pendant la recherche directe (une toutes les 8 s, la dernière reste). */
export function fallbackStep(elapsedSeconds: number, steps: number): number {
  return Math.min(Math.floor(elapsedSeconds / 8), steps - 1);
}

/** Meilleure release acceptée (la liste arrive déjà triée par le serveur). */
export function bestRelease(releases: readonly ArrRelease[]): ArrRelease | null {
  return releases.find((release) => release.approved) ?? null;
}

// ── Ajout d'un film (P2.6) ──────────────────────────────────────────────────

export type AddOutcome =
  | { kind: 'queue'; indexer: string | null }
  | { kind: 'failed' }
  | { kind: 'grabbed'; indexer: string | null }
  | { kind: 'timeout' }
  | { kind: 'waiting' };

/** Polls du suivi après l'ajout (toutes les 3 s, 60 s au plus). */
export const ADD_POLL_MAX = 20;
/** Grab sans entrée dans la file après 30 s : problème du client de téléchargement. */
export const ADD_GRAB_WITHOUT_QUEUE_POLLS = 10;

/** Bilan d'un tour de suivi après l'ajout (`addPoll` d'origine). */
export function addOutcome(
  movieId: number,
  poll: number,
  history: readonly MovieHistoryItem[],
  queue: readonly MovieQueueItem[],
  now = Date.now(),
): AddOutcome {
  const queued = queue.find((item) => item.movieId === movieId);
  if (queued) return { kind: 'queue', indexer: queued.indexer };
  const recent = (eventType: string) =>
    history.find(
      (item) =>
        item.eventType === eventType && item.date !== null && now - Date.parse(item.date) < 120_000,
    );
  if (recent('downloadFailed')) return { kind: 'failed' };
  const grab = recent('grabbed');
  if (grab && poll >= ADD_GRAB_WITHOUT_QUEUE_POLLS)
    return { kind: 'grabbed', indexer: grab.indexer };
  if (poll >= ADD_POLL_MAX) return { kind: 'timeout' };
  return { kind: 'waiting' };
}
