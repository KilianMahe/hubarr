// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Sonarr (API v3) : port de la partie bibliothèque de
// `Service/Media/SonarrClient.php` (séries, saisons, épisodes, fichiers,
// historique, file d'attente, calendrier, manquants, cutoff, liste de blocage,
// commandes, releases, renommage, import manuel). L'administration (profils,
// indexeurs, notifications…) vient en P3b dans le module `arr-admin`.
//
// Écarts voulus (comme D84 pour Radarr) : une erreur lève une
// `UpstreamError` au lieu de renvoyer `null`/`false` ; la suppression d'une
// série transmet aussi `addImportListExclusion` (paramètre de la spec).

import type { ArrSort } from '../radarr/client';
import type { CalendarEpisode, Series, SeriesQueueItem } from '@hubarr/shared';
import { ArrClient } from '../arr/client';
import { isUpstreamError } from '../http';
import { normalizeCalendarEntry, normalizeSeries, normalizeSeriesQueueRecord } from './normalize';
import type {
  SonarrBlocklistResourcePage,
  SonarrEpisodeFileResource,
  SonarrEpisodeResource,
  SonarrEpisodeResourcePage,
  SonarrHistoryResource,
  SonarrHistoryResourcePage,
  SonarrManualImportResource,
  SonarrPaths,
  SonarrQueueResource,
  SonarrReleaseResource,
  SonarrRenameEpisodeResource,
  SonarrSeriesEditorResource,
  SonarrSeriesResource,
  SonarrTagDetailsResource,
} from './types';

/** Bibliothèque complète (issue #41 de Prismarr) : `/api/v3/series` dépasse 8 s sur une grosse instance. */
export const LIBRARY_TIMEOUT_MS = 30_000;
/** Recherche interactive : Sonarr interroge chaque indexeur en direct (60 à 90 s). */
export const RELEASES_TIMEOUT_MS = 90_000;
export const GRAB_TIMEOUT_MS = 30_000;
/** Taille de page de la file d'attente lue par la bibliothèque. */
export const QUEUE_PAGE_SIZE = 50;
/** Fenêtre du calendrier de la page Séries (`getCalendar(14)`). */
export const LIBRARY_CALENDAR_DAYS = 14;

export interface SeriesRemovalOptions {
  deleteFiles?: boolean;
  /** Ajouter la série aux exclusions des listes d'import. */
  addImportExclusion?: boolean;
}

/** Élément de la file à importer : dossier de sortie et/ou identifiant du téléchargement. */
export interface QueueImportItem {
  path: string;
  downloadId: string;
}

/** Bilan d'un import manuel depuis la file (`manualImportFromQueueItems`). */
export interface ManualImportOutcome {
  ok: boolean;
  cmdId: number | null;
  imported: number;
  skipped: number;
  /** Une raison par fichier ignoré (« fichier : motif »), comme l'original. */
  reasons: string[];
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

const BY_DATE_DESC: ArrSort = { key: 'date', direction: 'descending' };

export class SonarrClient extends ArrClient<SonarrPaths> {
  // ── Séries ─────────────────────────────────────────────────────────────────

  async rawSeriesList(timeoutMs?: number): Promise<SonarrSeriesResource[]> {
    return (
      (await this.api.get('/api/v3/series', timeoutMs === undefined ? {} : { timeoutMs })) ?? []
    );
  }

  async seriesList(timeoutMs?: number): Promise<Series[]> {
    return (await this.rawSeriesList(timeoutMs)).map(normalizeSeries);
  }

  async rawSeries(id: number): Promise<SonarrSeriesResource> {
    const path = '/api/v3/series/{id}';
    return this.required(await this.api.get(path, { params: { id } }), path);
  }

  async series(id: number): Promise<Series> {
    return normalizeSeries(await this.rawSeries(id));
  }

  async rawLookup(term: string): Promise<SonarrSeriesResource[]> {
    return (await this.api.get('/api/v3/series/lookup', { query: { term } })) ?? [];
  }

  async lookup(term: string): Promise<Series[]> {
    return (await this.rawLookup(term)).map(normalizeSeries);
  }

  async addSeries(data: SonarrSeriesResource): Promise<Series> {
    const path = '/api/v3/series';
    return normalizeSeries(this.required(await this.api.post(path, { body: data }), path));
  }

  async updateSeries(id: number, data: SonarrSeriesResource): Promise<Series> {
    const path = '/api/v3/series/{id}';
    const updated = await this.api.put(path, { params: { id: String(id) }, body: data });
    return normalizeSeries(this.required(updated, path));
  }

  async deleteSeries(id: number, options: SeriesRemovalOptions = {}): Promise<void> {
    await this.api.delete('/api/v3/series/{id}', {
      params: { id },
      query: {
        deleteFiles: options.deleteFiles ?? false,
        addImportListExclusion: options.addImportExclusion ?? false,
      },
    });
  }

  /** Éditeur de masse : `changes` = champs à appliquer (`monitored`, `tags` + `applyTags`…). */
  async bulkUpdateSeries(
    seriesIds: readonly number[],
    changes: Omit<SonarrSeriesEditorResource, 'seriesIds'>,
  ): Promise<void> {
    await this.api.put('/api/v3/series/editor', {
      body: { ...changes, seriesIds: [...seriesIds] },
    });
  }

  async bulkDeleteSeries(
    seriesIds: readonly number[],
    options: SeriesRemovalOptions = {},
  ): Promise<void> {
    await this.api.delete('/api/v3/series/editor', {
      body: {
        seriesIds: [...seriesIds],
        deleteFiles: options.deleteFiles ?? false,
        addImportListExclusion: options.addImportExclusion ?? false,
      },
    });
  }

  /** Import par lot (`POST /series/import`) : ressources complètes, transmises telles quelles. */
  async importSeries(series: readonly SonarrSeriesResource[]): Promise<void> {
    await this.api.post('/api/v3/series/import', { body: [...series] });
  }

  /** Relit la série puis la renvoie avec le nouveau suivi (l'API n'a pas de PATCH). */
  async setMonitored(id: number, monitored: boolean): Promise<void> {
    const series = await this.rawSeries(id);
    await this.api.put('/api/v3/series/{id}', {
      params: { id: String(id) },
      body: { ...series, monitored },
    });
  }

  async setSeasonMonitored(
    seriesId: number,
    seasonNumber: number,
    monitored: boolean,
  ): Promise<void> {
    const series = await this.rawSeries(seriesId);
    const seasons = (series.seasons ?? []).map((season) =>
      season.seasonNumber === seasonNumber ? { ...season, monitored } : season,
    );
    await this.api.put('/api/v3/series/{id}', {
      params: { id: String(seriesId) },
      body: { ...series, seasons },
    });
  }

  // ── Épisodes ───────────────────────────────────────────────────────────────

  async episodes(seriesId: number): Promise<SonarrEpisodeResource[]> {
    return (await this.api.get('/api/v3/episode', { query: { seriesId } })) ?? [];
  }

  async episode(id: number): Promise<SonarrEpisodeResource> {
    const path = '/api/v3/episode/{id}';
    return this.required(await this.api.get(path, { params: { id } }), path);
  }

  async setEpisodeMonitored(id: number, monitored: boolean): Promise<void> {
    const episode = await this.episode(id);
    await this.api.put('/api/v3/episode/{id}', {
      params: { id: id },
      body: { ...episode, monitored },
    });
  }

  // ── Fichiers ───────────────────────────────────────────────────────────────

  async episodeFiles(seriesId: number): Promise<SonarrEpisodeFileResource[]> {
    return (await this.api.get('/api/v3/episodefile', { query: { seriesId } })) ?? [];
  }

  async episodeFile(id: number): Promise<SonarrEpisodeFileResource> {
    const path = '/api/v3/episodefile/{id}';
    return this.required(await this.api.get(path, { params: { id } }), path);
  }

  async updateEpisodeFile(
    id: number,
    data: SonarrEpisodeFileResource,
  ): Promise<SonarrEpisodeFileResource> {
    const path = '/api/v3/episodefile/{id}';
    return this.required(
      await this.api.put(path, { params: { id: String(id) }, body: data }),
      path,
    );
  }

  /** Mise à jour complète (`PUT /episodefile/bulk`) : accepte aussi le type de release et les drapeaux. */
  async bulkUpdateEpisodeFiles(files: readonly SonarrEpisodeFileResource[]): Promise<void> {
    await this.api.put('/api/v3/episodefile/bulk', { body: [...files] });
  }

  async deleteEpisodeFile(id: number): Promise<void> {
    await this.api.delete('/api/v3/episodefile/{id}', { params: { id } });
  }

  /** Réattribue un fichier existant à d'autres épisodes (commande `ManualImport`, comme l'original). */
  reassignEpisodeFile(
    file: SonarrEpisodeFileResource,
    seriesId: number,
    episodeIds: readonly number[],
  ): Promise<number | null> {
    return this.commandId('ManualImport', {
      files: [
        {
          path: file.path ?? '',
          seriesId,
          episodeIds: [...episodeIds],
          quality: file.quality ?? null,
          languages: file.languages ?? [],
          releaseGroup: file.releaseGroup ?? '',
          indexerFlags: file.indexerFlags ?? 0,
          releaseType: file.releaseType ?? 'singleEpisode',
          episodeFileId: file.id ?? 0,
        },
      ],
      importMode: 'auto',
    });
  }

  async qualityDefinitions() {
    return (await this.api.get('/api/v3/qualitydefinition')) ?? [];
  }

  /** Étiquettes et leur usage (types propres à Sonarr : `seriesIds`, `restrictionIds`). */
  async seriesTagDetails(): Promise<SonarrTagDetailsResource[]> {
    return (await this.api.get('/api/v3/tag/detail')) ?? [];
  }

  // ── Historique ─────────────────────────────────────────────────────────────

  async history(
    page = 1,
    pageSize = 50,
    sort: ArrSort = BY_DATE_DESC,
    seriesIds: readonly number[] = [],
  ): Promise<SonarrHistoryResourcePage> {
    return (
      (await this.api.get('/api/v3/history', {
        query: {
          page,
          pageSize,
          includeSeries: true,
          includeEpisode: true,
          sortKey: sort.key,
          sortDirection: sort.direction,
          ...(seriesIds.length > 0 ? { seriesIds: [...seriesIds] } : {}),
        },
      })) ?? {}
    );
  }

  /**
   * Historique d'une série : la liste paginée filtrée par `seriesIds`, car
   * `/history/series` ignore `includeEpisode` (note de l'original).
   */
  async seriesHistory(seriesId: number): Promise<SonarrHistoryResource[]> {
    const page = await this.api.get('/api/v3/history', {
      query: {
        seriesIds: [seriesId],
        includeEpisode: true,
        pageSize: 100,
        sortKey: 'date',
        sortDirection: 'descending',
      },
    });
    return page?.records ?? [];
  }

  // ── File d'attente ─────────────────────────────────────────────────────────

  async rawQueue(): Promise<SonarrQueueResource[]> {
    const page = await this.api.get('/api/v3/queue', {
      query: { pageSize: QUEUE_PAGE_SIZE, includeSeries: true, includeEpisode: true },
    });
    return page?.records ?? [];
  }

  async queue(): Promise<SeriesQueueItem[]> {
    return (await this.rawQueue()).map(normalizeSeriesQueueRecord);
  }

  // ── Calendrier ─────────────────────────────────────────────────────────────

  /** Épisodes diffusés entre `now - daysBefore` et `now + daysAhead` (dates en UTC). */
  async calendar(daysAhead = 30, daysBefore = 0, now = new Date()): Promise<CalendarEpisode[]> {
    const day = 86_400_000;
    const start = new Date(now.getTime() - daysBefore * day).toISOString().slice(0, 10);
    const end = new Date(now.getTime() + daysAhead * day).toISOString().slice(0, 10);
    const found = await this.api.get('/api/v3/calendar', {
      query: { start, end, includeSeries: true },
    });
    return (found ?? []).map(normalizeCalendarEntry);
  }

  // ── Manquants, cutoff, liste de blocage ────────────────────────────────────

  async missing(page = 1, pageSize = 50): Promise<SonarrEpisodeResourcePage> {
    return (
      (await this.api.get('/api/v3/wanted/missing', {
        query: {
          page,
          pageSize,
          sortKey: 'airDateUtc',
          sortDirection: 'descending',
          monitored: true,
          includeSeries: true,
        },
      })) ?? {}
    );
  }

  async cutoff(page = 1, pageSize = 50): Promise<SonarrEpisodeResourcePage> {
    return (
      (await this.api.get('/api/v3/wanted/cutoff', {
        query: {
          page,
          pageSize,
          sortKey: 'airDateUtc',
          sortDirection: 'descending',
          monitored: true,
          includeSeries: true,
          // Qualité actuelle affichée par la page : l'original la lisait sans la demander.
          includeEpisodeFile: true,
        },
      })) ?? {}
    );
  }

  async blocklist(
    page = 1,
    pageSize = 50,
    sort: ArrSort = BY_DATE_DESC,
    seriesIds: readonly number[] = [],
  ): Promise<SonarrBlocklistResourcePage> {
    return (
      (await this.api.get('/api/v3/blocklist', {
        query: {
          page,
          pageSize,
          sortKey: sort.key,
          sortDirection: sort.direction,
          ...(seriesIds.length > 0 ? { seriesIds: [...seriesIds] } : {}),
        },
      })) ?? {}
    );
  }

  // ── Indexeurs, clients, journaux (lecture seule ; l'administration vient en P3b) ──

  async indexers() {
    return (await this.api.get('/api/v3/indexer')) ?? [];
  }

  async downloadClients() {
    return (await this.api.get('/api/v3/downloadclient')) ?? [];
  }

  async logs(page = 1, pageSize = 20) {
    return (
      (await this.api.get('/api/v3/log', {
        query: { page, pageSize, sortKey: 'time', sortDirection: 'descending' },
      })) ?? {}
    );
  }

  // ── Commandes ──────────────────────────────────────────────────────────────

  searchSeries(id: number): Promise<number | null> {
    return this.commandId('SeriesSearch', { seriesId: id });
  }

  refreshSeries(id: number): Promise<number | null> {
    return this.commandId('RefreshSeries', { seriesId: id });
  }

  /** Analyse des fichiers d'une série sur le disque (P5c.6, V18). */
  rescanSeries(id: number): Promise<number | null> {
    return this.commandId('RescanSeries', { seriesId: id });
  }

  refreshAllSeries(): Promise<number | null> {
    return this.commandId('RefreshSeries');
  }

  rssSync(): Promise<number | null> {
    return this.commandId('RssSync');
  }

  searchSeason(seriesId: number, seasonNumber: number): Promise<number | null> {
    return this.commandId('SeasonSearch', { seriesId, seasonNumber });
  }

  searchEpisodes(episodeIds: readonly number[]): Promise<number | null> {
    return this.commandId('EpisodeSearch', { episodeIds: [...episodeIds] });
  }

  searchAllMissing(): Promise<number | null> {
    return this.commandId('MissingEpisodeSearch');
  }

  refreshMonitoredDownloads(): Promise<number | null> {
    return this.commandId('RefreshMonitoredDownloads');
  }

  // ── Releases ───────────────────────────────────────────────────────────────

  async episodeReleases(episodeId: number): Promise<SonarrReleaseResource[]> {
    return (
      (await this.api.get('/api/v3/release', {
        query: { episodeId },
        timeoutMs: RELEASES_TIMEOUT_MS,
      })) ?? []
    );
  }

  async seasonReleases(seriesId: number, seasonNumber: number): Promise<SonarrReleaseResource[]> {
    return (
      (await this.api.get('/api/v3/release', {
        query: { seriesId, seasonNumber },
        timeoutMs: RELEASES_TIMEOUT_MS,
      })) ?? []
    );
  }

  async grabRelease(guid: string, indexerId: number): Promise<void> {
    await this.api.post('/api/v3/release', {
      body: { guid, indexerId },
      timeoutMs: GRAB_TIMEOUT_MS,
    });
  }

  // ── Renommage ──────────────────────────────────────────────────────────────

  async renameProposals(seriesId: number): Promise<SonarrRenameEpisodeResource[]> {
    return (await this.api.get('/api/v3/rename', { query: { seriesId } })) ?? [];
  }

  /** Fichiers choisis → `RenameFiles` ; aucun → `RenameSeries` (toute la série). */
  executeRename(seriesId: number, fileIds: readonly number[] = []): Promise<number | null> {
    return fileIds.length > 0
      ? this.commandId('RenameFiles', { seriesId, files: [...fileIds] })
      : this.commandId('RenameSeries', { seriesIds: [seriesId] });
  }

  // ── Explorateur de dossiers de l'instance ──────────────────────────────────

  async filesystem(path: string) {
    const path_ = '/api/v3/filesystem';
    // La spec ne décrit pas la réponse : forme commune à Radarr.
    const result = (await this.api.get(path_, {
      query: { path, includeFiles: false, allowFoldersWithoutTrailingSlashes: true },
    })) as {
      parent?: string | null;
      directories?: { name?: string | null; path?: string | null }[] | null;
    } | null;
    return this.required(result, path_);
  }

  // ── Import manuel ──────────────────────────────────────────────────────────

  /**
   * Aperçu de l'import manuel : par `downloadId` (contexte du grab, épisodes
   * déjà reconnus), sinon par dossier (analyse du système de fichiers).
   */
  async manualImportPreview(
    folder: string | null,
    downloadId: string | null,
    filterExistingFiles = true,
  ): Promise<SonarrManualImportResource[]> {
    if (downloadId !== null && downloadId !== '') {
      return (
        (await this.api.get('/api/v3/manualimport', {
          query: { downloadId, filterExistingFiles },
        })) ?? []
      );
    }
    if (folder !== null && folder !== '') {
      return (
        (await this.api.get('/api/v3/manualimport', { query: { folder, filterExistingFiles } })) ??
        []
      );
    }
    return [];
  }

  /**
   * Import manuel d'éléments de la file (`manualImportFromQueueItems`) : chaque
   * téléchargement (dédoublonné par `downloadId`, sinon par chemin) passe par
   * l'aperçu de Sonarr, qui reconnaît les épisodes ; seuls les fichiers sans
   * refus et avec au moins un épisode sont importés, par une seule commande
   * `ManualImport` en mode `auto`. Un aperçu en échec compte comme « aucun aperçu ».
   */
  async manualImportFromQueueItems(
    items: readonly QueueImportItem[],
  ): Promise<ManualImportOutcome> {
    const files: Record<string, unknown>[] = [];
    let skipped = 0;
    const reasons: string[] = [];

    // Sonarr v4 découpe un téléchargement en un élément par épisode, tous avec
    // le même `downloadId` : sans dédoublonnage, N éléments donneraient N × N fichiers.
    const unique = new Map<string, QueueImportItem>();
    for (const item of items) {
      const path = item.path.trim();
      const downloadId = item.downloadId.trim();
      if (path === '' && downloadId === '') {
        skipped += 1;
        reasons.push('empty item');
        continue;
      }
      const key = downloadId !== '' ? `dl:${downloadId}` : `path:${path}`;
      if (!unique.has(key)) unique.set(key, { path, downloadId });
    }

    for (const { path, downloadId } of unique.values()) {
      let candidates: SonarrManualImportResource[];
      try {
        candidates = await this.manualImportPreview(
          path === '' ? null : path,
          downloadId === '' ? null : downloadId,
          false,
        );
      } catch (error) {
        if (!isUpstreamError(error)) throw error;
        candidates = [];
      }
      const label = path !== '' ? basename(path) : `downloadId ${downloadId.slice(0, 8)}`;
      if (candidates.length === 0) {
        skipped += 1;
        reasons.push(`no preview for ${label}`);
        continue;
      }
      for (const candidate of candidates) {
        const name = basename(candidate.path ?? (path !== '' ? path : label));
        const rejection = candidate.rejections?.[0];
        if (rejection !== undefined) {
          skipped += 1;
          reasons.push(`${name}: ${rejection.reason ?? 'rejected'}`);
          continue;
        }
        const episodes = candidate.episodes ?? [];
        if (episodes.length === 0) {
          skipped += 1;
          reasons.push(`${name}: no episode match`);
          continue;
        }
        // L'aperçu a fait le travail (qualité, langues, groupe, formats) : on le renvoie tel quel.
        files.push({
          path: candidate.path ?? path,
          folderName: candidate.folderName ?? null,
          seriesId: candidate.series?.id ?? null,
          episodeIds: episodes.map((episode) => episode.id ?? 0),
          releaseGroup: candidate.releaseGroup ?? null,
          quality: candidate.quality ?? null,
          languages: candidate.languages ?? [],
          indexerFlags: candidate.indexerFlags ?? 0,
          releaseType: candidate.releaseType ?? null,
          downloadId: candidate.downloadId ?? (downloadId !== '' ? downloadId : null),
          customFormats: candidate.customFormats ?? [],
          customFormatScore: candidate.customFormatScore ?? 0,
        });
      }
    }

    if (files.length === 0) {
      return { ok: false, cmdId: null, imported: 0, skipped, reasons };
    }
    try {
      const command = await this.sendCommand('ManualImport', { importMode: 'auto', files });
      return { ok: true, cmdId: command.id ?? null, imported: files.length, skipped, reasons };
    } catch (error) {
      if (!isUpstreamError(error)) throw error;
      return {
        ok: false,
        cmdId: null,
        imported: 0,
        skipped: skipped + files.length,
        reasons: [...reasons, 'Sonarr command rejected'],
      };
    }
  }
}
