// SPDX-License-Identifier: AGPL-3.0-or-later
// Journaux de l'application (`GET /api/admin/logs`, page « Journaux ») : les
// dernières entrées gardées en mémoire par le serveur, secrets masqués.

import { z } from 'zod';

/** Niveaux pino, du plus bavard au plus grave. */
export const LOG_LEVEL_NAMES = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevelName = (typeof LOG_LEVEL_NAMES)[number];
export const logLevelNameSchema = z.enum(LOG_LEVEL_NAMES);

/** Valeur numérique pino d'un niveau (`trace` = 10 … `fatal` = 60). */
export function logLevelValue(level: LogLevelName): number {
  return (LOG_LEVEL_NAMES.indexOf(level) + 1) * 10;
}

export const logEntrySchema = z.object({
  /** Numéro croissant depuis le démarrage (curseur de pagination). */
  id: z.number().int().nonnegative(),
  time: z.iso.datetime(),
  level: logLevelNameSchema,
  msg: z.string(),
  /** Service concerné (erreurs des intégrations), sinon `null`. */
  service: z.string().nullable(),
  /** Autres champs de l'entrée (instance, méthode, chemin, statut, erreur…). */
  context: z.record(z.string(), z.unknown()),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

export const APP_LOGS_PAGE_SIZE = 100;
export const APP_LOGS_PAGE_MAX = 500;

/** Filtres communs à la liste et au téléchargement. */
export const logsFilterSchema = z.object({
  /** Niveau minimal. */
  level: logLevelNameSchema.optional(),
  service: z.string().trim().max(64).optional(),
  /** Recherche dans le message et le contexte, sans casse. */
  q: z.string().trim().max(200).optional(),
});
export type LogsFilter = z.infer<typeof logsFilterSchema>;

export const logsQuerySchema = logsFilterSchema.extend({
  /** Entrées plus anciennes que cet id (page suivante). */
  before: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(APP_LOGS_PAGE_MAX).default(APP_LOGS_PAGE_SIZE),
});
export type LogsQuery = z.input<typeof logsQuerySchema>;

export const logsResponseSchema = z.object({
  /** Plus récentes d'abord. */
  entries: z.array(logEntrySchema),
  /** Entrées du tampon correspondant aux filtres. */
  total: z.number().int().nonnegative(),
  /** Curseur de la page suivante, `null` en fin de tampon. */
  nextBefore: z.number().int().nonnegative().nullable(),
  /** Taille du tampon (entrées les plus anciennes écartées au-delà). */
  capacity: z.number().int().positive(),
  /** Niveau minimal capturé dans le tampon. */
  level: logLevelNameSchema,
  /** Services présents dans le tampon (filtre). */
  services: z.array(z.string()),
});
export type LogsResponse = z.infer<typeof logsResponseSchema>;
