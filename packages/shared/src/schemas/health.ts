// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/health` : santé de l'application (HEALTHCHECK Docker), public.

import { z } from 'zod';
import type { ServiceId } from '../constants/services';

export const appHealthResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), db: z.literal('ok'), timestamp: z.iso.datetime() }),
  z.object({
    status: z.literal('error'),
    db: z.literal('unreachable'),
    timestamp: z.iso.datetime(),
  }),
]);
export type AppHealthResponse = z.infer<typeof appHealthResponseSchema>;

/**
 * Services à configuration unique suivis par la santé (`HealthCatalog::FLAT_SERVICES`),
 * dans l'ordre d'affichage. Radarr/Sonarr sont suivis par instance ; Gluetun n'a pas de sonde.
 */
export const HEALTH_FLAT_SERVICES = [
  'tmdb',
  'prowlarr',
  'seerr',
  'qbittorrent',
  'deluge',
  'transmission',
  'sabnzbd',
  'nzbget',
  'tautulli',
  'tracearr',
  'emby',
  'bazarr',
] as const satisfies readonly ServiceId[];

/** `true` joignable, `false` injoignable, `null` non configuré. */
const healthStateSchema = z.boolean().nullable();

export const instanceHealthSchema = z.object({
  slug: z.string(),
  name: z.string(),
  state: healthStateSchema,
});

/** `GET /api/health/services` (menu santé de la barre du haut, tiroir, paramètres). */
export const servicesHealthResponseSchema = z.object({
  services: z.record(z.string(), healthStateSchema),
  instances: z.object({
    radarr: z.array(instanceHealthSchema),
    sonarr: z.array(instanceHealthSchema),
  }),
  ok: z.number().int(),
  total: z.number().int(),
  timestamp: z.string(),
});
export type ServicesHealthResponse = z.infer<typeof servicesHealthResponseSchema>;

/**
 * Diagnostic passif d'un service pour la bannière « injoignable » de ses pages
 * (`HealthService::diagnose` sans valeurs saisies). `url` n'est renseignée que
 * pour un admin.
 */
export const serviceDiagnosisResponseSchema = z.object({
  ok: z.boolean(),
  category: z.enum([
    'ok',
    'unconfigured',
    'network',
    'auth',
    'forbidden',
    'not_found',
    'server_error',
    'host_whitelist',
    'unknown',
  ]),
  http: z.number().int().nullable(),
  url: z.string().nullable(),
});
export type ServiceDiagnosisResponse = z.infer<typeof serviceDiagnosisResponseSchema>;
