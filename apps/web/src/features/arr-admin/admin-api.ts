// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API d'administration Radarr/Sonarr (`/api/medias/:slug/<kind>/…`,
// P3b) et contexte des vues : service (`meta.service` de la route), instance
// (`:slug`), clés TanStack Query, messages d'erreur.

import {
  ARR_ADMIN_CAPABILITIES,
  arrCommandStatusSchema,
  arrTagUsageSchema,
  qualityProfileSummarySchema,
  rootFolderSummarySchema,
  type ArrAdminCapability,
  type ArrKind,
} from '@hubarr/shared';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, ref, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { z } from 'zod';
import { api } from '../../app/api/client';
import { apiErrorText } from '../../app/api/error-text';
import { useArrCommand } from '../movies/useArrCommand';

export function adminBase(kind: ArrKind, slug: string): string {
  return `/api/medias/${encodeURIComponent(slug)}/${kind}`;
}

/** Bilan d'une action, affiché en tête de page. */
export interface AdminFeedback {
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

export const adminKeys = {
  all: (kind: ArrKind, slug: string) => ['arr-admin', kind, slug] as const,
  page: (kind: ArrKind, slug: string, page: string, ...extra: (string | number)[]) =>
    ['arr-admin', kind, slug, page, ...extra] as const,
};

export interface AdminContext {
  kind: ComputedRef<ArrKind>;
  slug: ComputedRef<string>;
  /** Préfixe i18n de la page (`media.arr_admin.<prefix>`). */
  key(suffix: string): string;
  /** Clé propre au service (`…_radarr` ou `…_sonarr`). */
  kindKey(suffix: string): string;
  get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T>;
  post<T = void>(path: string, body?: unknown, schema?: z.ZodType<T>): Promise<T>;
  queryKey(page: string, ...extra: (string | number)[]): readonly unknown[];
  has(capability: ArrAdminCapability): boolean;
  /** Message d'une erreur d'action : texte de l'instance s'il y en a un, sinon `fallbackKey`. */
  errorMessage(error: unknown, fallbackKey: string): string;
}

/** Contexte d'une vue d'administration (`prefix` : clés `media.arr_admin.<prefix>.*`). */
export function useAdminContext(prefix: string): AdminContext {
  const route = useRoute();
  const { t } = useI18n();
  const kind = computed<ArrKind>(() => (route.meta.service === 'sonarr' ? 'sonarr' : 'radarr'));
  const slug = computed(() => String(route.params.slug ?? ''));
  return {
    kind,
    slug,
    key: (suffix) => `media.arr_admin.${prefix}.${suffix}`,
    kindKey: (suffix) => `media.arr_admin.${prefix}.${suffix}_${kind.value}`,
    get: (path, schema, signal) =>
      api.get(`${adminBase(kind.value, slug.value)}${path}`, schema, signal),
    post: (path, body, schema) =>
      api.post(`${adminBase(kind.value, slug.value)}${path}`, body ?? {}, schema),
    queryKey: (page, ...extra) => adminKeys.page(kind.value, slug.value, page, ...extra),
    has: (capability) => ARR_ADMIN_CAPABILITIES[kind.value][capability],
    errorMessage: (error, fallbackKey) => apiErrorText(error, t, fallbackKey),
  };
}

/**
 * Données d'une page d'administration (`GET <path>`) : contexte, requête,
 * titre, message d'échec du chargement et bilan de la dernière action.
 */
export function useAdminPage<T>(
  prefix: string,
  path: string | (() => string),
  schema: z.ZodType<T>,
  options: { refetchInterval?: number } = {},
) {
  const ctx = useAdminContext(prefix);
  const { t } = useI18n();
  const resolved = computed(() => (typeof path === 'function' ? path() : path));
  const query = useQuery({
    queryKey: computed(() => ctx.queryKey(prefix, resolved.value)),
    queryFn: ({ signal }) => ctx.get(resolved.value, schema, signal),
    placeholderData: keepPreviousData,
    retry: false,
    ...(options.refetchInterval === undefined ? {} : { refetchInterval: options.refetchInterval }),
  });
  const feedback = ref<AdminFeedback | null>(null);
  const error = computed(() => (query.isError.value ? t(ctx.kindKey('error_unreachable')) : null));
  const title = computed(() => t(ctx.key('page_title')));

  /**
   * Lance une action : bilan de succès (`successText`) ou d'échec (message de
   * l'instance, sinon `errorKey`), puis relit la page. Renvoie `true` si
   * l'action a réussi.
   */
  async function run(
    action: () => Promise<unknown>,
    errorKey: string,
    successText?: string,
  ): Promise<boolean> {
    try {
      await action();
      feedback.value = successText ? { type: 'success', text: successText } : null;
      await query.refetch();
      return true;
    } catch (failure) {
      feedback.value = { type: 'error', text: ctx.errorMessage(failure, errorKey) };
      return false;
    }
  }

  return { ctx, query, feedback, error, title, run };
}

/** Confirmation d'une action (le dialogue se ferme avant d'émettre `confirm`). */
export function useConfirmAction() {
  const open = ref(false);
  const message = ref('');
  let pending: (() => Promise<unknown>) | null = null;
  return {
    open,
    message,
    ask(text: string, action: () => Promise<unknown>): void {
      message.value = text;
      pending = action;
      open.value = true;
    },
    async confirm(): Promise<void> {
      const action = pending;
      pending = null;
      if (action) await action();
    },
  };
}

/** Étiquettes de l'instance (`/tags`), pour choisir par nom au lieu d'ids. */
export function useInstanceTags(ctx: AdminContext) {
  const query = useQuery({
    queryKey: computed(() => ctx.queryKey('tags', '/tags')),
    queryFn: ({ signal }) => ctx.get('/tags', z.array(arrTagUsageSchema), signal),
    retry: false,
  });
  const items = computed(() =>
    (query.data.value ?? []).map((tag) => ({ value: tag.id, title: tag.label })),
  );
  const labelOf = (id: number): string =>
    query.data.value?.find((tag) => tag.id === id)?.label ?? `#${id}`;
  return { query, items, labelOf };
}

/**
 * Profils de qualité et dossiers racine de l'instance (routes de P2/P3a :
 * `/films/…` pour Radarr, `/sonarr/…` pour Sonarr), chargés à la demande.
 */
export function useProfilesAndFolders(ctx: AdminContext, enabled: () => boolean) {
  const base = computed(
    () =>
      `/api/medias/${encodeURIComponent(ctx.slug.value)}/${ctx.kind.value === 'radarr' ? 'films' : 'sonarr'}`,
  );
  const profiles = useQuery({
    queryKey: computed(() => ctx.queryKey('quality-profiles')),
    queryFn: ({ signal }) =>
      api.get(`${base.value}/quality-profiles`, z.array(qualityProfileSummarySchema), signal),
    enabled: computed(enabled),
    staleTime: 60_000,
    retry: false,
  });
  const folders = useQuery({
    queryKey: computed(() => ctx.queryKey('root-folders')),
    queryFn: ({ signal }) =>
      api.get(`${base.value}/root-folders`, z.array(rootFolderSummarySchema), signal),
    enabled: computed(enabled),
    staleTime: 60_000,
    retry: false,
  });
  return {
    profiles,
    folders,
    profileItems: computed(() =>
      (profiles.data.value ?? []).map((profile) => ({ value: profile.id, title: profile.name })),
    ),
    folderItems: computed(() =>
      (folders.data.value ?? []).map((folder) => ({ value: folder.path, title: folder.path })),
    ),
    profileName: (id: unknown) =>
      profiles.data.value?.find((profile) => profile.id === id)?.name ??
      (typeof id === 'number' ? `#${id}` : '—'),
  };
}

/** Suivi d'une commande de l'instance (`/command/:id/status` de l'administration). */
export function useAdminCommand(ctx: AdminContext) {
  return useArrCommand({
    statusOf: (_slug, cmdId) => ctx.get(`/command/${cmdId}/status`, arrCommandStatusSchema),
  });
}
