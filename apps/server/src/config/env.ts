// SPDX-License-Identifier: AGPL-3.0-or-later
// Variables d'environnement validées par zod au démarrage. Une valeur
// invalide arrête le serveur avec un message explicite plutôt qu'un comportement
// silencieusement faux.

import { LOG_LEVEL_NAMES } from '@hubarr/shared';
import { z } from 'zod';
import { normalizeBasePath } from '../http/base-path';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/**
 * `HUBARR_TRUST_PROXY` : `true`, `false`, ou une liste
 * d'adresses et de plages (`proxy-addr`, séparées par des virgules). Par défaut,
 * les réseaux privés, de lien local et de bouclage : un proxy inverse de homelab
 * ou un réseau Docker y figure toujours (l'original faisait confiance au pair direct).
 */
const trustProxySchema = z
  .string()
  .default('loopback,linklocal,uniquelocal')
  .transform((value): boolean | string => {
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    return trimmed;
  });

const envSchema = z.object({
  HUBARR_HOST: z.string().min(1).default('0.0.0.0'),
  HUBARR_PORT: z.coerce.number().int().min(1).max(65535).default(7070),
  /** Dossier des données persistantes (base SQLite, sauvegarde, avatars). */
  HUBARR_DATA_DIR: z.string().min(1).default('/data'),
  /** WARN par défaut, comme l'original. */
  HUBARR_LOG_LEVEL: z.enum(LOG_LEVELS).default('warn'),
  /**
   * Niveau minimal gardé pour la page « Journaux » (1 000 dernières entrées en
   * mémoire). Par défaut, celui de la console ; `info` y garde plus de détail
   * sans rendre la console plus bavarde.
   */
  HUBARR_LOG_BUFFER_LEVEL: z.enum(LOG_LEVEL_NAMES).optional(),
  HUBARR_VERSION: z.string().min(1).default('0.0.0-dev'),
  HUBARR_TRUST_PROXY: trustProxySchema,
  /**
   * Préfixe de chemin quand le reverse proxy transmet le chemin complet
   * (`/hubarr`) ; sinon, `X-Forwarded-Prefix` d'un proxy de confiance.
   */
  HUBARR_BASE_PATH: z
    .string()
    .default('')
    .transform((value, ctx) => {
      const normalized = normalizeBasePath(value);
      if (normalized === null) {
        ctx.addIssue({ code: 'custom', message: 'chemin attendu, par exemple /hubarr' });
        return z.NEVER;
      }
      return normalized;
    }),
  /** Origines autorisées à intégrer Hubarr dans une iframe, séparées par des espaces. */
  HUBARR_FRAME_ANCESTORS: z.string().default(''),
  /** Origine de l'API TMDB (tests de bout en bout seulement : faux TMDB). */
  HUBARR_TMDB_API_URL: z.url({ protocol: /^https?$/ }).optional(),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
  override readonly name = 'InvalidEnvError';
}

/** Valide l'environnement ; une variable vide équivaut à une variable absente. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const defined = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(defined);
  if (!result.success) {
    throw new InvalidEnvError(
      `variables d'environnement invalides :\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
