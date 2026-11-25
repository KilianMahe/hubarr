// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Radarr (API v3) : port de la partie bibliothèque de
// `Service/Media/RadarrClient.php` (films, fichiers, historique, file
// d'attente, calendrier, commandes, releases, manquants, cutoff, collections,
// liste de blocage, import manuel). L'administration (profils, indexeurs,
// notifications…) vient en P3b dans le module `arr-admin`.
//
// Écarts voulus : les noms de paramètres faux de l'original sont
// corrigés d'après la spec (`addImportExclusion`, `movieFileIds`,
// `skipRedownload`) ; les paramètres inconnus de l'API (`includeMovie` des
// manquants et de la liste de blocage) ne sont plus envoyés.

import type { Movie, MovieQueueItem } from '@hubarr/shared';
import { ArrClient } from '../arr/client';
import { normalizeMovie, normalizeQueueRecord } from './normalize';
import type {
  RadarrBlocklistResourcePage,
  RadarrCollectionResource,
  RadarrHistoryResource,
  RadarrHistoryResourcePage,
  RadarrImportListResource,
  RadarrManualImportResource,
  RadarrMovieEditorResource,
  RadarrMovieFileResource,
  RadarrMovieResource,
  RadarrPaths,
  RadarrQueueResource,
  RadarrReleaseResource,
} from './types';

/**
 * Délai de la bibliothèque complète : sur une grosse
 * instance, `/api/v3/movie` dépasse les 8 s par défaut. Réservé aux routes de
 * bibliothèque ; les widgets fréquents gardent 8 s.
 */
export const LIBRARY_TIMEOUT_MS = 30_000;
/** Recherche interactive : Radarr interroge chaque indexeur en direct (60 à 90 s). */
export const RELEASES_TIMEOUT_MS = 90_000;
export const GRAB_TIMEOUT_MS = 30_000;

/** Taille de page de la file d'attente lue par la bibliothèque. */
export const QUEUE_PAGE_SIZE = 50;

export interface HistoryQuery {
  page?: number;
  pageSize?: number;
  /** Type d'évènement (`grabbed`, `downloadFolderImported`…) ; vide = tous. */
  eventType?: string;
  movieId?: number;
  /** Tri de l'amont (P5c.5) ; défaut : date décroissante. */
  sort?: ArrSort;
  /** Films à garder (recherche par titre, P5c.5). */
  movieIds?: readonly number[];
}

/** Tri d'une liste paginée de l'amont (`sortKey`, `sortDirection`). */
export interface ArrSort {
  key: string;
  direction: 'ascending' | 'descending';
}
const BY_DATE_DESC: ArrSort = { key: 'date', direction: 'descending' };

export interface MovieRemovalOptions {
  deleteFiles?: boolean;
  /** Ajouter le film aux exclusions des listes d'import. */
  addImportExclusion?: boolean;
}

export class RadarrClient extends ArrClient<RadarrPaths> {
  // ── Films ──────────────────────────────────────────────────────────────────

  async rawMovies(timeoutMs?: number): Promise<RadarrMovieResource[]> {
    return (
      (await this.api.get('/api/v3/movie', timeoutMs === undefined ? {} : { timeoutMs })) ?? []
    );
  }

  async movies(timeoutMs?: number): Promise<Movie[]> {
    return (await this.rawMovies(timeoutMs)).map(normalizeMovie);
  }

  async rawMovie(id: number): Promise<RadarrMovieResource> {
    const path = '/api/v3/movie/{id}';
    return this.required(await this.api.get(path, { params: { id } }), path);
  }

  async movie(id: number): Promise<Movie> {
    return normalizeMovie(await this.rawMovie(id));
  }

  async lookupMovies(term: string): Promise<Movie[]> {
    const found = await this.api.get('/api/v3/movie/lookup', { query: { term } });
    return (found ?? []).map(normalizeMovie);
  }

  async lookupByImdb(imdbId: string): Promise<Movie | null> {
    const found = await this.api.get('/api/v3/movie/lookup', { query: { term: `imdb:${imdbId}` } });
    const first = found?.[0];
    return first === undefined ? null : normalizeMovie(first);
  }

  async lookupByTmdb(tmdbId: number): Promise<Movie | null> {
    const found = await this.api.get('/api/v3/movie/lookup/tmdb', { query: { tmdbId } });
    return found === null ? null : normalizeMovie(found);
  }

  async addMovie(data: RadarrMovieResource): Promise<Movie> {
    const path = '/api/v3/movie';
    return normalizeMovie(this.required(await this.api.post(path, { body: data }), path));
  }

  async updateMovie(id: number, data: RadarrMovieResource): Promise<Movie> {
    const path = '/api/v3/movie/{id}';
    const updated = await this.api.put(path, { params: { id: String(id) }, body: data });
    return normalizeMovie(this.required(updated, path));
  }

  async deleteMovie(id: number, options: MovieRemovalOptions = {}): Promise<void> {
    await this.api.delete('/api/v3/movie/{id}', {
      params: { id },
      query: {
        deleteFiles: options.deleteFiles ?? false,
        addImportExclusion: options.addImportExclusion ?? false,
      },
    });
  }

  /** Relit le film puis le renvoie avec le nouveau suivi (l'API n'a pas de PATCH). */
  async setMonitored(id: number, monitored: boolean): Promise<void> {
    const movie = await this.rawMovie(id);
    await this.api.put('/api/v3/movie/{id}', {
      params: { id: String(id) },
      body: { ...movie, monitored },
    });
  }

  /** Éditeur de masse : `changes` = champs à appliquer (`monitored`, `tags` + `applyTags`…). */
  async bulkUpdateMovies(
    movieIds: readonly number[],
    changes: Omit<RadarrMovieEditorResource, 'movieIds'>,
  ): Promise<void> {
    await this.api.put('/api/v3/movie/editor', { body: { ...changes, movieIds: [...movieIds] } });
  }

  /** Suppression de masse : sur l'éditeur (`/movie/bulk` n'existe pas, 404). */
  async bulkDeleteMovies(
    movieIds: readonly number[],
    options: MovieRemovalOptions = {},
  ): Promise<void> {
    await this.api.delete('/api/v3/movie/editor', {
      body: {
        movieIds: [...movieIds],
        deleteFiles: options.deleteFiles ?? false,
        addImportExclusion: options.addImportExclusion ?? false,
      },
    });
  }

  // ── Indexeurs, clients, journaux (lecture seule ; l'administration vient en P3b) ──

  async indexers() {
    return (await this.api.get('/api/v3/indexer')) ?? [];
  }

  async downloadClients() {
    return (await this.api.get('/api/v3/downloadclient')) ?? [];
  }

  /** Journaux récents, du plus récent au plus ancien. */
  async logs(page = 1, pageSize = 20) {
    return (
      (await this.api.get('/api/v3/log', {
        query: { page, pageSize, sortKey: 'time', sortDirection: 'descending' },
      })) ?? {}
    );
  }

  // ── Fichiers ───────────────────────────────────────────────────────────────

  async movieFiles(movieId: number): Promise<RadarrMovieFileResource[]> {
    return (await this.api.get('/api/v3/moviefile', { query: { movieId: [movieId] } })) ?? [];
  }

  async movieFile(fileId: number): Promise<RadarrMovieFileResource> {
    const path = '/api/v3/moviefile/{id}';
    return this.required(await this.api.get(path, { params: { id: fileId } }), path);
  }

  async updateMovieFile(
    fileId: number,
    data: RadarrMovieFileResource,
  ): Promise<RadarrMovieFileResource> {
    const path = '/api/v3/moviefile/{id}';
    return this.required(
      await this.api.put(path, { params: { id: String(fileId) }, body: data }),
      path,
    );
  }

  async deleteMovieFile(fileId: number): Promise<void> {
    await this.api.delete('/api/v3/moviefile/{id}', { params: { id: fileId } });
  }

  async bulkDeleteMovieFiles(fileIds: readonly number[]): Promise<void> {
    await this.api.delete('/api/v3/moviefile/bulk', { body: { movieFileIds: [...fileIds] } });
  }

  async qualityDefinitions() {
    return (await this.api.get('/api/v3/qualitydefinition')) ?? [];
  }

  async extraFiles(movieId: number) {
    return (await this.api.get('/api/v3/extrafile', { query: { movieId } })) ?? [];
  }

  async credits(movieId: number) {
    return (await this.api.get('/api/v3/credit', { query: { movieId } })) ?? [];
  }

  async renameProposals(movieId: number) {
    return (await this.api.get('/api/v3/rename', { query: { movieId: [movieId] } })) ?? [];
  }

  async executeRename(movieId: number): Promise<number | null> {
    return this.commandId('RenameMovie', { movieIds: [movieId] });
  }

  // ── Historique ─────────────────────────────────────────────────────────────

  async history(query: HistoryQuery = {}): Promise<RadarrHistoryResourcePage> {
    const eventType = query.eventType ?? '';
    const movieId = query.movieId ?? 0;
    const sort = query.sort ?? BY_DATE_DESC;
    const movieIds = query.movieIds ?? (movieId > 0 ? [movieId] : []);
    return (
      (await this.http.get<RadarrHistoryResourcePage | null>('/api/v3/history', {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 50,
        includeMovie: true,
        sortKey: sort.key,
        sortDirection: sort.direction,
        ...(eventType === '' ? {} : { eventType }),
        ...(movieIds.length > 0 ? { movieIds: [...movieIds] } : {}),
      })) ?? {}
    );
  }

  async movieHistory(movieId: number): Promise<RadarrHistoryResource[]> {
    return (
      (await this.api.get('/api/v3/history/movie', { query: { movieId, includeMovie: true } })) ??
      []
    );
  }

  async historySince(date: Date, eventType = ''): Promise<RadarrHistoryResource[]> {
    // Format de l'original : `Y-m-d\TH:i:s\Z`, sans millisecondes.
    const iso = `${date.toISOString().slice(0, 19)}Z`;
    return (
      (await this.http.get<RadarrHistoryResource[] | null>('/api/v3/history/since', {
        date: iso,
        ...(eventType === '' ? {} : { eventType }),
      })) ?? []
    );
  }

  // ── File d'attente ─────────────────────────────────────────────────────────

  async rawQueue(): Promise<RadarrQueueResource[]> {
    const page = await this.api.get('/api/v3/queue', {
      query: { pageSize: QUEUE_PAGE_SIZE, includeMovie: true },
    });
    return page?.records ?? [];
  }

  async queue(): Promise<MovieQueueItem[]> {
    return (await this.rawQueue()).map(normalizeQueueRecord);
  }

  async queueDetails(): Promise<RadarrQueueResource[]> {
    return (await this.api.get('/api/v3/queue/details', { query: { includeMovie: true } })) ?? [];
  }

  // ── Calendrier ─────────────────────────────────────────────────────────────

  /** Films sortant entre `now - daysBefore` et `now + daysAhead` (dates en UTC). */
  async calendar(daysAhead = 90, daysBefore = 0, now = new Date()): Promise<Movie[]> {
    const day = 86_400_000;
    const start = new Date(now.getTime() - daysBefore * day).toISOString().slice(0, 10);
    const end = new Date(now.getTime() + daysAhead * day).toISOString().slice(0, 10);
    const found = await this.api.get('/api/v3/calendar', { query: { start, end } });
    return (found ?? []).map(normalizeMovie);
  }

  // ── Commandes ──────────────────────────────────────────────────────────────

  searchMovie(id: number): Promise<number | null> {
    return this.commandId('MoviesSearch', { movieIds: [id] });
  }

  searchAllMissing(): Promise<number | null> {
    return this.commandId('MissingMoviesSearch');
  }

  refreshMovie(id: number): Promise<number | null> {
    return this.commandId('RefreshMovie', { movieIds: [id] });
  }

  rescanMovie(id: number): Promise<number | null> {
    return this.commandId('RescanMovie', { movieId: id });
  }

  refreshAllMovies(): Promise<number | null> {
    return this.commandId('RefreshMovie');
  }

  rssSync(): Promise<number | null> {
    return this.commandId('RssSync');
  }

  // ── Releases ───────────────────────────────────────────────────────────────

  async releases(movieId: number): Promise<RadarrReleaseResource[]> {
    return (
      (await this.api.get('/api/v3/release', {
        query: { movieId },
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

  // ── Manquants, cutoff ──────────────────────────────────────────────────────

  async missing(page = 1, pageSize = 50) {
    return (
      (await this.api.get('/api/v3/wanted/missing', {
        query: {
          page,
          pageSize,
          sortKey: 'inCinemas',
          sortDirection: 'descending',
          monitored: true,
        },
      })) ?? {}
    );
  }

  /** Films sous le seuil de qualité (sortie en salles décroissante). */
  async cutoff(page = 1, pageSize = 50) {
    return (
      (await this.api.get('/api/v3/wanted/cutoff', {
        query: {
          page,
          pageSize,
          sortKey: 'inCinemas',
          sortDirection: 'descending',
          monitored: true,
        },
      })) ?? {}
    );
  }

  // ── Collections ────────────────────────────────────────────────────────────

  async collections(): Promise<RadarrCollectionResource[]> {
    return (await this.api.get('/api/v3/collection')) ?? [];
  }

  async collection(id: number): Promise<RadarrCollectionResource> {
    const path = '/api/v3/collection/{id}';
    return this.required(await this.api.get(path, { params: { id } }), path);
  }

  /** Suivi d'une collection ; le profil de qualité n'est envoyé que s'il est choisi. */
  async updateCollection(id: number, monitored: boolean, qualityProfileId = 0): Promise<void> {
    await this.api.put('/api/v3/collection/{id}', {
      params: { id: String(id) },
      body: { monitored, ...(qualityProfileId > 0 ? { qualityProfileId } : {}) },
    });
  }

  async bulkUpdateCollections(collectionIds: readonly number[], monitored: boolean): Promise<void> {
    await this.api.put('/api/v3/collection', {
      body: { collectionIds: [...collectionIds], monitored },
    });
  }

  // ── Liste de blocage ───────────────────────────────────────────────────────

  async blocklist(
    page = 1,
    pageSize = 50,
    sort: ArrSort = BY_DATE_DESC,
    movieIds: readonly number[] = [],
  ): Promise<RadarrBlocklistResourcePage> {
    return (
      (await this.api.get('/api/v3/blocklist', {
        query: {
          page,
          pageSize,
          sortKey: sort.key,
          sortDirection: sort.direction,
          ...(movieIds.length > 0 ? { movieIds: [...movieIds] } : {}),
        },
      })) ?? {}
    );
  }

  async movieBlocklist(movieId: number) {
    return (await this.api.get('/api/v3/blocklist/movie', { query: { movieId } })) ?? [];
  }

  // ── Listes d'import (suivi de personnes TMDb ; l'administration vient en P3b) ──

  async importLists(): Promise<RadarrImportListResource[]> {
    return (await this.api.get('/api/v3/importlist')) ?? [];
  }

  async importListSchema(): Promise<RadarrImportListResource[]> {
    return (await this.api.get('/api/v3/importlist/schema')) ?? [];
  }

  async createImportList(list: RadarrImportListResource): Promise<RadarrImportListResource> {
    const path = '/api/v3/importlist';
    return this.required(await this.api.post(path, { body: list }), path);
  }

  async deleteImportList(id: number): Promise<void> {
    await this.api.delete('/api/v3/importlist/{id}', { params: { id } });
  }

  // ── Explorateur de dossiers de l'instance ──────────────────────────────────

  /** Sous-dossiers d'un chemin du serveur Radarr (sans les fichiers). */
  async filesystem(path: string) {
    const path_ = '/api/v3/filesystem';
    return this.required(
      await this.api.get(path_, {
        query: { path, includeFiles: false, allowFoldersWithoutTrailingSlashes: true },
      }),
      path_,
    );
  }

  // ── Import manuel ──────────────────────────────────────────────────────────

  /**
   * Aperçu de l'import manuel : par `downloadId` (téléchargement de la file,
   * film reconnu au grab), sinon par dossier.
   */
  async manualImportPreview(
    source: { folder: string } | { downloadId: string },
    filterExistingFiles = true,
  ): Promise<RadarrManualImportResource[]> {
    return (
      (await this.api.get('/api/v3/manualimport', {
        query: { ...source, filterExistingFiles },
      })) ?? []
    );
  }

  /**
   * Lance l'import des fichiers choisis ; renvoie l'id de la commande. `auto`
   * laisse Radarr choisir (copie ou lien pour un torrent qui continue de partager).
   */
  manualImport(
    files: readonly Record<string, unknown>[],
    importMode: 'move' | 'auto' = 'move',
  ): Promise<number | null> {
    return this.commandId('ManualImport', { importMode, files: [...files] });
  }
}
