// SPDX-License-Identifier: AGPL-3.0-or-later
// Synchronisation des lectures Tracearr (lot 7, « Vu »).
//
// L'API publique ne dit pas si un utilisateur a vu un titre donné : on recopie
// donc son historique (API v2, filtré par identité) dans `tracearr_watch`.
// Premier passage complet, puis incrémental à partir du curseur (début de la
// dernière lecture importée), avec un recouvrement qui rattrape les lectures
// encore en cours au passage précédent. Les lignes sont mises à jour par leur
// identifiant Tracearr : relire une lecture ne crée pas de doublon.
//
// Seules les identités associées à un compte Hubarr sont synchronisées.

import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client';
import { tracearrSync, tracearrWatch, users } from '../../db/schema';
import { TracearrClient, type TracearrWatchRow } from '../../integrations/activity/tracearr';
import { httpFor } from '../activity/routes';
import { hasRequiredFields, readServiceConfig } from '../services/config';

/** Fréquence de la synchronisation périodique. */
export const WATCH_SYNC_INTERVAL_MS = 15 * 60_000;
/** Recouvrement du passage incrémental (lectures longues ou reprises). */
export const WATCH_SYNC_OVERLAP_MS = 6 * 3_600_000;
/** Pages de 100 lectures parcourues au plus par passage (garde-fou). */
export const WATCH_SYNC_MAX_PAGES = 2_000;

export type WatchSyncError = 'unconfigured' | 'unreachable';

export interface WatchSyncResult {
  imported: number;
  error: WatchSyncError | null;
}

/** Client Tracearr, ou `null` si le service est désactivé ou incomplet. */
export function tracearrClient(app: FastifyInstance): TracearrClient | null {
  const config = readServiceConfig(app.db, 'tracearr');
  if (!config.enabled || !hasRequiredFields('tracearr', config)) return null;
  return new TracearrClient(httpFor(app, 'tracearr'), app.cache.store);
}

/** Identités Tracearr associées à au moins un compte. */
export function linkedIdentities(db: Db): string[] {
  return db
    .selectDistinct({ id: users.tracearrUserId })
    .from(users)
    .where(isNotNull(users.tracearrUserId))
    .all()
    .flatMap((row) => (row.id === null ? [] : [row.id]));
}

/** Retire les lectures et l'état d'une identité que plus aucun compte n'utilise. */
export function forgetIdentityIfUnused(db: Db, tracearrUserId: string): void {
  const used = db
    .select({ n: count() })
    .from(users)
    .where(eq(users.tracearrUserId, tracearrUserId))
    .get();
  if ((used?.n ?? 0) > 0) return;
  db.transaction((tx) => {
    tx.delete(tracearrWatch).where(eq(tracearrWatch.tracearrUserId, tracearrUserId)).run();
    tx.delete(tracearrSync).where(eq(tracearrSync.tracearrUserId, tracearrUserId)).run();
  });
}

export function syncStateOf(db: Db, tracearrUserId: string) {
  const state = db
    .select()
    .from(tracearrSync)
    .where(eq(tracearrSync.tracearrUserId, tracearrUserId))
    .get();
  const plays =
    db
      .select({ n: count() })
      .from(tracearrWatch)
      .where(eq(tracearrWatch.tracearrUserId, tracearrUserId))
      .get()?.n ?? 0;
  return {
    lastRunAt: state?.lastRunAt?.toISOString() ?? null,
    error: state?.lastError ?? null,
    plays,
  };
}

export class TracearrWatchSync {
  readonly #running = new Map<string, Promise<WatchSyncResult>>();

  constructor(
    private readonly app: FastifyInstance,
    private readonly now: () => number = Date.now,
  ) {}

  /** Synchronise une identité ; un passage déjà en cours pour elle est réutilisé. */
  sync(tracearrUserId: string, options: { full?: boolean } = {}): Promise<WatchSyncResult> {
    const current = this.#running.get(tracearrUserId);
    if (current !== undefined) return current;
    const run = this.#run(tracearrUserId, options.full === true).finally(() => {
      this.#running.delete(tracearrUserId);
    });
    this.#running.set(tracearrUserId, run);
    return run;
  }

  /** Synchronise toutes les identités associées, l'une après l'autre. */
  async syncAll(options: { full?: boolean } = {}): Promise<void> {
    for (const id of linkedIdentities(this.app.db)) await this.sync(id, options);
  }

  /** Attend la fin des passages en cours (arrêt de l'application, tests). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.#running.values()]);
  }

  /** Démarre la synchronisation périodique ; renvoie la fonction d'arrêt. */
  start(intervalMs = WATCH_SYNC_INTERVAL_MS): () => void {
    const tick = () => {
      this.syncAll().catch((error: unknown) => {
        this.app.log.warn({ err: error }, 'synchronisation Tracearr en échec');
      });
    };
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    return () => {
      clearInterval(timer);
    };
  }

  async #run(tracearrUserId: string, full: boolean): Promise<WatchSyncResult> {
    const db = this.app.db;
    const client = tracearrClient(this.app);
    if (client === null) return this.#finish(tracearrUserId, null, 0, 'unconfigured');
    const state = full
      ? undefined
      : db.select().from(tracearrSync).where(eq(tracearrSync.tracearrUserId, tracearrUserId)).get();
    const cursorAt = state?.cursorAt?.getTime() ?? null;
    const since = cursorAt === null ? null : new Date(cursorAt - WATCH_SYNC_OVERLAP_MS);

    const collected: TracearrWatchRow[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < WATCH_SYNC_MAX_PAGES; page += 1) {
      const result = await client.watchPage(tracearrUserId, since, cursor);
      if (result === null) return this.#finish(tracearrUserId, cursorAt, 0, 'unreachable');
      collected.push(...result.rows);
      cursor = result.nextCursor;
      if (cursor === null) break;
    }

    const shows = await client.showIds(
      collected.flatMap((row) => (row.showMediaId === null ? [] : [row.showMediaId])),
    );
    const values = collected.flatMap((row) => {
      const show = row.showMediaId === null ? undefined : shows.get(row.showMediaId);
      const tmdbId = row.mediaType === 'movie' ? row.tmdbId : (show?.tmdbId ?? null);
      const tvdbId = row.mediaType === 'movie' ? null : (show?.tvdbId ?? null);
      // Un épisode dont la série est inconnue ne peut être rattaché à rien.
      if (tmdbId === null && tvdbId === null) return [];
      return [
        {
          tracearrUserId,
          recordId: row.recordId,
          mediaType: row.mediaType,
          tmdbId,
          tvdbId,
          season: row.season,
          episode: row.episode,
          watchedAt: new Date(row.startedAt),
          percent: row.percent,
          watched: row.watched,
        },
      ];
    });
    const latest = collected.reduce((max, row) => Math.max(max, row.startedAt), cursorAt ?? 0);

    db.transaction((tx) => {
      if (full)
        tx.delete(tracearrWatch).where(eq(tracearrWatch.tracearrUserId, tracearrUserId)).run();
      for (const value of values) {
        tx.insert(tracearrWatch)
          .values(value)
          .onConflictDoUpdate({
            target: tracearrWatch.recordId,
            set: {
              tracearrUserId: value.tracearrUserId,
              tmdbId: value.tmdbId,
              tvdbId: value.tvdbId,
              season: value.season,
              episode: value.episode,
              watchedAt: value.watchedAt,
              percent: value.percent,
              watched: value.watched,
            },
          })
          .run();
      }
    });
    return this.#finish(tracearrUserId, latest === 0 ? null : latest, values.length, null);
  }

  #finish(
    tracearrUserId: string,
    cursorAt: number | null,
    imported: number,
    error: WatchSyncError | null,
  ): WatchSyncResult {
    const set = {
      cursorAt: cursorAt === null ? null : new Date(cursorAt),
      lastRunAt: new Date(this.now()),
      lastError: error,
    };
    this.app.db
      .insert(tracearrSync)
      .values({ tracearrUserId, ...set })
      .onConflictDoUpdate({ target: tracearrSync.tracearrUserId, set })
      .run();
    if (error !== null) {
      this.app.log.warn({ service: 'tracearr', error }, 'synchronisation des lectures impossible');
    }
    return { imported, error };
  }
}

/** Lectures vues d'une identité, regroupées pour le front. */
export function watchedOf(db: Db, tracearrUserId: string) {
  const rows = db
    .select({
      mediaType: tracearrWatch.mediaType,
      tmdbId: tracearrWatch.tmdbId,
      tvdbId: tracearrWatch.tvdbId,
      season: tracearrWatch.season,
      episode: tracearrWatch.episode,
    })
    .from(tracearrWatch)
    .where(and(eq(tracearrWatch.tracearrUserId, tracearrUserId), eq(tracearrWatch.watched, true)))
    .all();
  const movies = new Set<number>();
  const shows = new Map<
    string,
    { tmdbId: number | null; tvdbId: number | null; episodes: Map<string, [number, number]> }
  >();
  for (const row of rows) {
    if (row.mediaType === 'movie') {
      if (row.tmdbId !== null) movies.add(row.tmdbId);
      continue;
    }
    if (row.season === null || row.episode === null) continue;
    const key = `${row.tmdbId ?? ''}:${row.tvdbId ?? ''}`;
    const show = shows.get(key) ?? { tmdbId: row.tmdbId, tvdbId: row.tvdbId, episodes: new Map() };
    show.episodes.set(`${row.season}:${row.episode}`, [row.season, row.episode]);
    shows.set(key, show);
  }
  return {
    movies: [...movies].sort((a, b) => a - b),
    shows: [...shows.values()].map((show) => ({
      tmdbId: show.tmdbId,
      tvdbId: show.tvdbId,
      episodes: [...show.episodes.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    })),
  };
}

export interface RecentWatchedTitle {
  mediaType: 'movie' | 'tv';
  tmdbId: number | null;
  tvdbId: number | null;
}

/** Lignes relues au plus pour trouver les derniers titres regardés. */
const RECENT_SCAN_ROWS = 1_000;

/**
 * Derniers titres regardés (lectures terminées) d'une identité, du plus
 * récent au plus ancien, sans doublon : une série compte une fois, quel que
 * soit le nombre d'épisodes vus (suggestions du lot 8).
 */
export function recentWatchedTitles(
  db: Db,
  tracearrUserId: string,
  limit: number,
): RecentWatchedTitle[] {
  const rows = db
    .select({
      mediaType: tracearrWatch.mediaType,
      tmdbId: tracearrWatch.tmdbId,
      tvdbId: tracearrWatch.tvdbId,
    })
    .from(tracearrWatch)
    .where(and(eq(tracearrWatch.tracearrUserId, tracearrUserId), eq(tracearrWatch.watched, true)))
    .orderBy(desc(tracearrWatch.watchedAt))
    .limit(RECENT_SCAN_ROWS)
    .all();
  const seen = new Set<string>();
  const out: RecentWatchedTitle[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const mediaType = row.mediaType === 'movie' ? 'movie' : 'tv';
    if (mediaType === 'movie' && row.tmdbId === null) continue;
    const key = `${mediaType}:${row.tmdbId ?? ''}:${row.tvdbId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mediaType, tmdbId: row.tmdbId, tvdbId: row.tvdbId });
  }
  return out;
}
