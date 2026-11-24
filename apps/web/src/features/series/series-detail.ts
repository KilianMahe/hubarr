// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique pure de la fiche série (`#modal-serie`, P3a.2) : saisons et
// épisodes, étiquettes des releases, évènements de l'historique, infobulle des
// informations média, lignes du gestionnaire de fichiers et leurs changements.

import type {
  Episode,
  EpisodeFile,
  EpisodeFilesBulkUpdateRequest,
  SeriesRelease,
  SeriesRenameProposal,
} from '@hubarr/shared';
import { episodeCode } from './library';

type Translate = (key: string, values?: Record<string, unknown>) => string;

// ── Saisons ─────────────────────────────────────────────────────────────────

export interface SeasonGroup {
  seasonNumber: number;
  episodes: Episode[];
  /** Épisodes avec un fichier. */
  files: number;
  total: number;
  percent: number;
  /** Au moins un épisode suivi (bouton de suivi de la saison, comme l'original). */
  monitored: boolean;
}

/** Épisodes groupés par saison, la plus récente en premier ; épisodes dans l'ordre. */
export function seasonGroups(episodes: readonly Episode[]): SeasonGroup[] {
  const bySeason = new Map<number, Episode[]>();
  for (const episode of episodes) {
    bySeason.set(episode.seasonNumber, [...(bySeason.get(episode.seasonNumber) ?? []), episode]);
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => b - a)
    .map(([seasonNumber, list]) => {
      // Dernier épisode en premier, spéciaux compris (P5c.6, V20).
      const sorted = [...list].sort((a, b) => b.episodeNumber - a.episodeNumber);
      const files = sorted.filter((episode) => episode.hasFile).length;
      return {
        seasonNumber,
        episodes: sorted,
        files,
        total: sorted.length,
        percent: sorted.length > 0 ? Math.round((files / sorted.length) * 100) : 0,
        monitored: sorted.some((episode) => episode.monitored),
      };
    });
}

/** Saison ouverte à l'ouverture : la plus récente, sauf les spéciaux. */
export function initiallyOpenSeason(groups: readonly SeasonGroup[]): number | null {
  const first = groups[0];
  return first !== undefined && first.seasonNumber > 0 ? first.seasonNumber : null;
}

export type EpisodeStatus = 'downloaded' | 'missing' | 'upcoming' | 'unmonitored';

/**
 * État d'un épisode (pastille et libellé de sa ligne) : présent, suivi et
 * diffusé sans fichier (manquant), suivi et pas encore diffusé (à venir), non
 * suivi. Sans date de diffusion, un épisode suivi est « à venir ».
 */
export function episodeStatus(
  episode: Pick<Episode, 'hasFile' | 'monitored' | 'airDateUtc'>,
  now: number = Date.now(),
): EpisodeStatus {
  if (episode.hasFile) return 'downloaded';
  if (!episode.monitored) return 'unmonitored';
  const aired = episode.airDateUtc === null ? Number.NaN : Date.parse(episode.airDateUtc);
  return Number.isFinite(aired) && aired <= now ? 'missing' : 'upcoming';
}

export const EPISODE_STATUS_COLORS: Record<EpisodeStatus, string> = {
  downloaded: 'success',
  missing: 'warning',
  upcoming: 'info',
  unmonitored: 'muted',
};

export function seasonLabel(t: Translate, seasonNumber: number): string {
  return seasonNumber === 0
    ? t('media.series.detail.season_specials')
    : t('media.series.detail.season_tpl', { n: seasonNumber });
}

/**
 * Plage d'épisodes pour un Maj+clic sur les boutons de suivi : indices entre
 * le dernier clic et le clic courant (inclus), dans l'ordre affiché.
 */
export function monitorRange(
  ids: readonly number[],
  anchor: number | null,
  current: number,
): number[] {
  const from = anchor === null ? -1 : ids.indexOf(anchor);
  const to = ids.indexOf(current);
  if (from < 0 || to < 0 || from === to) return [current];
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** État d'un bouton de recherche de la fiche (épisode ou saison). */
export type SearchState = 'running' | 'done';

// ── Infos média ─────────────────────────────────────────────────────────────

/** Lignes de l'infobulle d'un épisode téléchargé (`d_ei_*` d'origine). */
export function mediaInfoLines(t: Translate, file: EpisodeFile, size: string): string[] {
  const lines: string[] = [];
  const media = file.mediaInfo;
  if (file.quality) lines.push(t('media.series.detail.episode_info_path') + file.quality.name);
  if (media?.videoCodec) {
    lines.push(
      t('media.series.detail.episode_info_video') +
        [
          media.videoCodec,
          media.videoBitDepth ? `${media.videoBitDepth}bit` : null,
          media.videoDynamicRange,
        ]
          .filter(Boolean)
          .join(' '),
    );
  }
  if (media?.resolution)
    lines.push(t('media.series.detail.episode_info_resolution') + media.resolution);
  if (media?.audioCodec) {
    lines.push(
      t('media.series.detail.episode_info_audio') +
        media.audioCodec +
        (media.audioChannels ? ` ${media.audioChannels}ch` : ''),
    );
  }
  if (media?.audioLanguages)
    lines.push(t('media.series.detail.episode_info_tracks') + media.audioLanguages);
  if (media?.subtitles) lines.push(t('media.series.detail.episode_info_subs') + media.subtitles);
  if (file.size > 0) lines.push(t('media.series.detail.episode_info_size') + size);
  if (file.releaseGroup)
    lines.push(t('media.series.detail.episode_info_group') + file.releaseGroup);
  return lines;
}

// ── Releases ────────────────────────────────────────────────────────────────

/** « Saison 1 » pour un pack, sinon « 1x02, 1x03 » (`versionLabel` d'origine). */
export function releaseVersionLabel(t: Translate, release: SeriesRelease): string {
  if (release.fullSeason) {
    return t('media.label.season_prefix', { number: release.seasonNumber ?? '?' });
  }
  return release.episodeNumbers
    .map((episode) => `${release.seasonNumber ?? '?'}x${episode}`)
    .join(', ');
}

/** Numérotation TVDB correspondante (`tvdbLabel`) : plage au-delà de trois épisodes. */
export function releaseTvdbLabel(release: SeriesRelease): string {
  const season = release.mappedSeasonNumber;
  const episodes = release.mappedEpisodeNumbers;
  if (season === null || episodes.length === 0) return '';
  if (episodes.length > 3) return `${season}x${episodes[0]}-${episodes[episodes.length - 1]}`;
  return episodes.map((episode) => `${season}x${episode}`).join(', ');
}

/** Étiquette affichée près du titre : découpage de la release, et TVDB s'il diffère. */
export function releaseLabels(t: Translate, releases: readonly SeriesRelease[]) {
  return Object.fromEntries(
    releases.map((release) => {
      const version = releaseVersionLabel(t, release);
      const tvdb = releaseTvdbLabel(release);
      const label = tvdb !== '' && tvdb !== version ? `${version} · TVDB ${tvdb}` : version;
      return [release.guid, label];
    }),
  );
}

// ── Historique ──────────────────────────────────────────────────────────────

/** Évènements de Sonarr v4 : libellé et couleur (l'original lisait des numéros). */
export const SERIES_HISTORY_EVENTS: Record<string, { key: string; color: string }> = {
  grabbed: { key: 'media.series_history.event_grabbed', color: 'success' },
  downloadFolderImported: { key: 'media.series_history.event_imported', color: 'primary' },
  seriesFolderImported: { key: 'media.series_history.event_folder_imported', color: 'primary' },
  episodeFileDeleted: { key: 'media.series_history.event_deleted', color: 'error' },
  episodeFileRenamed: { key: 'media.series_history.event_renamed', color: 'muted' },
  downloadFailed: { key: 'media.series_history.event_failed', color: 'error' },
};

export function historyEventLabel(t: Translate, eventType: string): string {
  const event = SERIES_HISTORY_EVENTS[eventType];
  return event === undefined ? eventType : t(event.key);
}

export function historyEventColor(eventType: string): string {
  return SERIES_HISTORY_EVENTS[eventType]?.color ?? 'muted';
}

// ── Renommage ───────────────────────────────────────────────────────────────

/** « S01E02-E03 » d'une proposition de renommage. */
export function proposalCode(proposal: SeriesRenameProposal): string {
  const episodes = proposal.episodeNumbers.map((episode) => String(episode).padStart(2, '0'));
  return `S${String(proposal.seasonNumber).padStart(2, '0')}E${episodes.join('-E')}`;
}

// ── Gestionnaire de fichiers ────────────────────────────────────────────────

export interface FileRow {
  fileId: number;
  path: string;
  size: number;
  seasonNumber: number;
  /** Épisode attribué (le premier, comme l'original) ; `null` : aucun. */
  episodeNumber: number | null;
  qualityId: number | null;
  languages: { id: number; name: string }[];
  releaseGroup: string;
  releaseType: string;
  indexerFlags: number;
  qualityVersion: number;
}

/** Lignes du gestionnaire, triées par saison puis épisode (fichiers sans épisode à la fin). */
export function fileRowsOf(files: readonly EpisodeFile[], episodes: readonly Episode[]): FileRow[] {
  const episodeOf = new Map<number, number>();
  for (const episode of episodes) {
    if (episode.episodeFileId > 0 && !episodeOf.has(episode.episodeFileId)) {
      episodeOf.set(episode.episodeFileId, episode.episodeNumber);
    }
  }
  return files
    .map((file) => ({
      fileId: file.id,
      path: file.relativePath ?? file.path ?? '',
      size: file.size,
      seasonNumber: file.seasonNumber,
      episodeNumber: episodeOf.get(file.id) ?? null,
      qualityId: file.quality?.id ?? null,
      languages: file.languages.map((language) => ({ ...language })),
      releaseGroup: file.releaseGroup ?? '',
      releaseType: file.releaseType ?? '',
      indexerFlags: file.indexerFlags,
      qualityVersion: file.qualityVersion,
    }))
    .sort(
      (a, b) =>
        a.seasonNumber - b.seasonNumber || (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999),
    );
}

const languageKey = (languages: readonly { id: number }[]) =>
  languages
    .map((language) => language.id)
    .sort((a, b) => a - b)
    .join(',');

/** Changements d'une ligne : métadonnées (mise à jour complète) et/ou réattribution. */
export interface RowChanges {
  update: EpisodeFilesBulkUpdateRequest | null;
  /** Épisode cible d'une réattribution ; `missing` : saison changée sans épisode choisi. */
  reassign: { episodeId: number } | 'missing' | null;
}

export function rowChanges(
  original: FileRow,
  current: FileRow,
  episodes: readonly Episode[],
): RowChanges {
  const update: EpisodeFilesBulkUpdateRequest = { fileId: current.fileId };
  if (current.qualityId !== null && current.qualityId !== original.qualityId) {
    update.qualityId = current.qualityId;
  }
  if (
    current.languages.length > 0 &&
    languageKey(current.languages) !== languageKey(original.languages)
  ) {
    update.languages = current.languages;
  }
  if (current.releaseGroup !== original.releaseGroup) update.releaseGroup = current.releaseGroup;
  if (current.releaseType !== original.releaseType && current.releaseType !== '') {
    const type = (['singleEpisode', 'multiEpisode', 'seasonPack'] as const).find(
      (value) => value === current.releaseType,
    );
    if (type !== undefined) update.releaseType = type;
  }
  if (current.indexerFlags !== original.indexerFlags) update.indexerFlags = current.indexerFlags;

  const seasonChanged = current.seasonNumber !== original.seasonNumber;
  let reassign: RowChanges['reassign'] = null;
  if (seasonChanged && current.episodeNumber === null) reassign = 'missing';
  else if (
    current.episodeNumber !== null &&
    (seasonChanged || current.episodeNumber !== original.episodeNumber)
  ) {
    const target = episodes.find(
      (episode) =>
        episode.seasonNumber === current.seasonNumber &&
        episode.episodeNumber === current.episodeNumber,
    );
    if (target !== undefined) reassign = { episodeId: target.id };
  }
  return { update: Object.keys(update).length > 1 ? update : null, reassign };
}

export function isRowDirty(
  original: FileRow,
  current: FileRow,
  episodes: readonly Episode[],
): boolean {
  const changes = rowChanges(original, current, episodes);
  return changes.update !== null || changes.reassign !== null;
}

export { episodeCode };
