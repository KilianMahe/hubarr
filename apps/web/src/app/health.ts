// SPDX-License-Identifier: AGPL-3.0-or-later
// État de santé des services (`GET /api/health/services`), partagé par le menu
// santé de la barre du haut, les pastilles du tiroir et les paramètres.
// Poussé par le flux temps réel (sujet `health`), sinon relu toutes les 60 s
// comme l'original (le serveur garde 10 s en cache).

import { servicesHealthResponseSchema } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { api } from './api/client';
import { useLiveQuery } from './live';

export const SERVICES_HEALTH_KEY = ['health', 'services'] as const;
export const SERVICES_HEALTH_INTERVAL_MS = 60_000;

export function useServicesHealth() {
  const refetchInterval = useLiveQuery({
    topic: 'health',
    queryKey: SERVICES_HEALTH_KEY,
    mode: 'set',
    map: (data) => servicesHealthResponseSchema.parse(data),
    fallbackMs: SERVICES_HEALTH_INTERVAL_MS,
  });
  return useQuery({
    queryKey: SERVICES_HEALTH_KEY,
    queryFn: ({ signal }) => api.get('/api/health/services', servicesHealthResponseSchema, signal),
    refetchInterval,
    staleTime: 10_000,
  });
}
