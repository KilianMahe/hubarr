<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// File d'attente Radarr dans la bibliothèque (`#queue-card` d'origine) : relue
// toutes les 2 s (et Radarr relit ses clients une fois sur trois), repliée par
// défaut, masquée quand elle est vide. Par élément : progression ou état
// d'import, statut, messages d'erreur ; forcer l'import (import manuel suivi,
// puis retrait de la file et scan du film), forcer le téléchargement,
// supprimer (client, liste de blocage). Un film qui quitte la file est signalé
// (`imported`). Le passage au flux SSE viendra en P5.
import type { MovieQueueItem } from '@hubarr/shared';
import {
  msChevronRight,
  msDelete,
  msDownload,
  msFolderOpen,
  msRefresh,
  msWarningFill,
} from '../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { moviesApi, moviesKeys } from './movies-api';
import {
  QUEUE_POLL_MS,
  leftQueue,
  movieIdsOf,
  queueActions,
  queueProgress,
  queueState,
  type ImportedMovie,
  type QueueState,
} from './queue';
import { useArrCommand } from './useArrCommand';
import { useLiveQuery } from '../../app/live';
import { useNotifyStore } from '../../app/stores/notify';
import EmptyState from '../../components/EmptyState.vue';
import { mediaDetailLocation } from '../../app/media-links';

const props = defineProps<{
  slug: string;
  /** Imports manuels repérés au chargement (commandes en cours). */
  manualImportRunning: boolean;
  /**
   * Onglet « File d'attente » (P5c.6, V18) : toujours dépliée, affichée même
   * vide ; le film mène à sa fiche ; « Actualiser » et « Scanner » le film.
   */
  standalone?: boolean;
}>();
const emit = defineEmits<{ imported: [movies: ImportedMovie[]] }>();
const { t } = useI18n();
const notify = useNotifyStore();
const format = useFormat();
const commands = useArrCommand();

let polls = 0;
const queue = useQuery({
  queryKey: computed(() => moviesKeys.queue(props.slug)),
  queryFn: ({ signal }) => {
    polls += 1;
    // Une fois sur trois (toutes les 6 s), Radarr relit ses clients de téléchargement.
    if (polls % 3 === 1) void moviesApi.refreshDownloads(props.slug).catch(() => undefined);
    return moviesApi.queue(props.slug, signal);
  },
  refetchInterval: useLiveQuery({
    topic: () => `queue.radarr.${props.slug}`,
    queryKey: () => moviesKeys.queue(props.slug),
    fallbackMs: QUEUE_POLL_MS,
  }),
  retry: false,
});
const items = computed(() => queue.data.value ?? []);

// Films sortis de la file depuis le relevé précédent : importés.
let previous: Set<number> | null = null;
let titles = new Map<number, string>();
watch(items, (list) => {
  if (previous !== null) {
    const left = leftQueue(previous, list);
    if (left.length > 0) {
      emit(
        'imported',
        left.map((id) => ({ id, title: titles.get(id) ?? '' })),
      );
    }
  }
  previous = movieIdsOf(list);
  titles = new Map(
    list.flatMap((item) => (item.movieId === null ? [] : [[item.movieId, item.title]])),
  );
});

const open = ref(props.standalone);

/** Actualiser ou scanner le film d'une ligne (V18). */
const commandBusy = ref<Record<string, boolean>>({});
async function movieCommand(movieId: number, title: string, kind: 'refresh' | 'rescan') {
  const key = `${kind}${movieId}`;
  const name = `${t(`media.queue_page.${kind}`)} · ${title}`;
  commandBusy.value = { ...commandBusy.value, [key]: true };
  try {
    await (kind === 'refresh' ? moviesApi.refresh : moviesApi.rescan)(props.slug, movieId);
    notify.success('server.command_started', { name });
  } catch {
    notify.error('server.command_error', { name });
  } finally {
    commandBusy.value = { ...commandBusy.value, [key]: false };
  }
}

// ── État affiché ────────────────────────────────────────────────────────────

interface ImportRun {
  status: 'running' | 'done' | 'failed';
  message: string | null;
}
const imports = reactive(new Map<number, ImportRun>());
const anyImport = computed(
  () => props.manualImportRunning || [...imports.values()].some((run) => run.status === 'running'),
);

function stateOf(item: MovieQueueItem): QueueState {
  return queueState(item, anyImport.value);
}
const STATE_COLORS: Record<QueueState, string> = {
  importing: 'primary',
  pending: 'info',
  blocked: 'warning',
  warning: 'warning',
  error: 'error',
  completed: 'success',
  downloading: 'service-text',
  other: 'muted',
};
function statusLabel(item: MovieQueueItem, state: QueueState): string {
  switch (state) {
    case 'importing':
      return t('media.films.queue.status_importing');
    case 'pending':
      return t('media.films.queue.status_pending');
    case 'blocked':
      return t('media.films.queue.status_blocked');
    case 'warning':
      return t('media.films.queue.status_warning_prefix') + item.status;
    case 'error':
      return t('media.films.queue.status_error_prefix') + item.status;
    case 'completed':
      return t('media.films.queue.status_completed');
    case 'downloading':
      return t('media.films.queue.status_downloading');
    case 'other':
      return item.status;
  }
}
function progressLabel(item: MovieQueueItem, state: QueueState): string {
  if (state === 'importing') return t('media.films.queue.importing');
  if (state === 'pending') return t('media.films.queue.import_pending');
  if (state === 'blocked') return t('media.films.queue.import_blocked');
  if (state === 'completed') return t('media.films.queue.completed_pct');
  return `${queueProgress(item)}%`;
}
function progressValue(item: MovieQueueItem, state: QueueState): number {
  return ['importing', 'pending', 'blocked', 'completed'].includes(state)
    ? 100
    : queueProgress(item);
}
function sizeLine(item: MovieQueueItem): string {
  const size = item.size ? format.bytes(item.size) : '0';
  return item.eta ? size + t('media.films.queue.eta_prefix') + (format.time(item.eta) ?? '') : size;
}

// ── Actions ─────────────────────────────────────────────────────────────────

const busy = reactive(new Set<number>());
const errors = reactive(new Map<number, string>());

async function forceImport(item: MovieQueueItem): Promise<void> {
  if (item.id === null) return;
  const queueId = item.id;
  imports.set(queueId, { status: 'running', message: null });
  errors.delete(queueId);
  try {
    const started = await moviesApi.queueImport(props.slug, queueId);
    if (started.cmdId === null) throw new Error('no command');
    const result = await commands.follow(props.slug, started.cmdId, ({ status }) => {
      imports.set(queueId, { status: 'running', message: status.message });
    });
    if (result.outcome === 'completed') {
      imports.set(queueId, { status: 'done', message: null });
      // Retire l'élément sans nouvelle recherche, puis fait scanner le film.
      void moviesApi
        .queueDelete(props.slug, queueId, { blocklist: false, skipRedownload: true })
        .catch(() => undefined);
      if (item.movieId !== null)
        void moviesApi.rescan(props.slug, item.movieId).catch(() => undefined);
      setTimeout(() => void queue.refetch(), 2_000);
    } else if (result.outcome === 'failed') {
      imports.set(queueId, {
        status: 'failed',
        message: t('media.films.queue.import_failed', {
          message: result.status.message ?? t('media.films.queue.import_failed_short'),
        }),
      });
    }
  } catch {
    imports.delete(queueId);
    errors.set(queueId, t('media.films.queue.network_error'));
  }
}

async function forceGrab(item: MovieQueueItem): Promise<void> {
  if (item.id === null) return;
  busy.add(item.id);
  try {
    await moviesApi.queueGrab(props.slug, item.id);
    await queue.refetch();
  } catch {
    errors.set(item.id, t('media.films.queue.error'));
  } finally {
    busy.delete(item.id);
  }
}

const delayed = computed(() =>
  items.value.flatMap((item) => (item.id !== null && queueActions(item).grab ? [item.id] : [])),
);
const grabbingAll = ref(false);
async function forceGrabAll(): Promise<void> {
  grabbingAll.value = true;
  try {
    await moviesApi.queueGrabBulk(props.slug, delayed.value);
    await queue.refetch();
  } finally {
    grabbingAll.value = false;
  }
}

const deleting = ref<number | null>(null);
const deleteOptions = reactive({ removeFromClient: false, blocklist: false });
function askDelete(item: MovieQueueItem): void {
  if (item.id === null) return;
  deleting.value = deleting.value === item.id ? null : item.id;
  Object.assign(deleteOptions, { removeFromClient: false, blocklist: false });
}
async function confirmDelete(item: MovieQueueItem): Promise<void> {
  if (item.id === null) return;
  const queueId = item.id;
  deleting.value = null;
  busy.add(queueId);
  try {
    await moviesApi.queueDelete(props.slug, queueId, { ...deleteOptions, skipRedownload: false });
    await queue.refetch();
  } catch {
    errors.set(queueId, t('media.films.queue.error'));
  } finally {
    busy.delete(queueId);
  }
}

function runOf(item: MovieQueueItem): ImportRun | undefined {
  return item.id === null ? undefined : imports.get(item.id);
}
</script>

<template>
  <v-card
    v-if="items.length > 0 || standalone"
    variant="flat"
    border
    class="mb-3"
    data-test="queue-panel"
  >
    <EmptyState
      v-if="standalone && items.length === 0 && !queue.isPending.value"
      inline
      :title="t('media.queue_page.empty')"
    />
    <div v-if="items.length > 0" class="d-flex align-center pa-2 ga-2">
      <v-btn
        v-if="!standalone"
        :prepend-icon="msChevronRight"
        variant="text"
        class="queue-toggle flex-grow-1 justify-start"
        :class="{ 'queue-toggle--open': open }"
        :aria-expanded="open"
        data-test="queue-toggle"
        @click="open = !open"
      >
        <v-icon :icon="msDownload" size="18" class="mr-2" />
        {{ t('media.films.queue.title') }}
        <v-chip
          size="x-small"
          color="service"
          variant="flat"
          class="ml-2"
          data-test="queue-count"
          >{{ items.length }}</v-chip
        >
      </v-btn>
      <v-btn
        v-if="delayed.length > 1"
        :prepend-icon="msDownload"
        size="small"
        variant="tonal"
        color="success"
        :loading="grabbingAll"
        data-test="queue-grab-all"
        @click="forceGrabAll"
        >{{ t('media.films.queue.action_force_download') }} ({{ delayed.length }})</v-btn
      >
    </div>
    <v-expand-transition>
      <div v-show="open">
        <v-divider />
        <div
          v-for="item in items"
          :key="item.id ?? item.title"
          class="queue-item"
          data-test="queue-item"
        >
          <div class="queue-item__main">
            <div class="text-body-medium font-weight-medium queue-item__title">
              <router-link
                v-if="item.movieId !== null"
                :to="mediaDetailLocation('radarr', slug, item.movieId)"
                class="queue-item__link"
                :title="t('media.queue_page.open_movie')"
                data-test="queue-open"
                >{{ item.title }}</router-link><template v-else>{{ item.title }}</template
              ><span v-if="item.year" class="text-muted"> ({{ item.year }})</span>
              <v-chip size="x-small" variant="tonal" color="info" class="ml-1">{{
                item.quality
              }}</v-chip>
            </div>
            <div
              v-for="(message, index) in item.statusMessages"
              :key="index"
              class="text-body-small text-error"
            >
              <v-icon :icon="msWarningFill" size="12" /> {{ message.messages.join('. ') }}
            </div>
            <template v-if="runOf(item)">
              <v-progress-linear
                :model-value="100"
                :color="
                  runOf(item)?.status === 'failed'
                    ? 'error'
                    : runOf(item)?.status === 'done'
                      ? 'success'
                      : 'primary'
                "
                :indeterminate="runOf(item)?.status === 'running'"
                rounded
                height="6"
                class="mt-1"
              />
              <div
                class="text-body-small mt-1"
                :class="runOf(item)?.status === 'failed' ? 'text-error' : ''"
              >
                {{
                  runOf(item)?.status === 'done'
                    ? t('media.films.queue.import_done_status')
                    : (runOf(item)?.message ?? t('media.films.queue.importing'))
                }}
              </div>
            </template>
            <template v-else>
              <div class="d-flex align-center ga-2 mt-1">
                <v-progress-linear
                  :model-value="progressValue(item, stateOf(item))"
                  :color="STATE_COLORS[stateOf(item)]"
                  :indeterminate="stateOf(item) === 'importing'"
                  rounded
                  height="6"
                />
                <span class="text-body-small text-no-wrap">{{
                  progressLabel(item, stateOf(item))
                }}</span>
              </div>
              <div
                v-if="!['importing', 'pending', 'blocked', 'completed'].includes(stateOf(item))"
                class="text-label-small text-muted"
              >
                {{ sizeLine(item) }}
              </div>
            </template>
            <div v-if="item.id !== null && errors.get(item.id)" class="text-body-small text-error">
              {{ errors.get(item.id) }}
            </div>
          </div>
          <v-chip
            size="small"
            variant="tonal"
            :color="STATE_COLORS[stateOf(item)]"
            class="queue-item__status"
            >{{ statusLabel(item, stateOf(item)) }}</v-chip
          >
          <div class="queue-item__actions">
            <template v-if="standalone && item.movieId !== null">
              <v-btn
                :icon="msRefresh"
                size="small"
                variant="text"
                :loading="commandBusy[`refresh${item.movieId}`]"
                :title="t('media.queue_page.refresh')"
                :aria-label="t('media.queue_page.refresh')"
                data-test="queue-refresh"
                @click="movieCommand(item.movieId, item.title, 'refresh')"
              />
              <v-btn
                :icon="msFolderOpen"
                size="small"
                variant="text"
                :loading="commandBusy[`rescan${item.movieId}`]"
                :title="t('media.queue_page.rescan')"
                :aria-label="t('media.queue_page.rescan')"
                data-test="queue-rescan"
                @click="movieCommand(item.movieId, item.title, 'rescan')"
              />
            </template>
            <v-btn
              v-if="queueActions(item).import"
              :icon="msDownload"
              size="small"
              variant="text"
              color="primary"
              :loading="runOf(item)?.status === 'running'"
              :title="t('media.films.queue.action_force_import')"
              :aria-label="t('media.films.queue.action_force_import')"
              data-test="queue-import"
              @click="forceImport(item)"
            />
            <v-btn
              v-if="queueActions(item).grab"
              :icon="msDownload"
              size="small"
              variant="text"
              color="success"
              :loading="item.id !== null && busy.has(item.id)"
              :title="t('media.films.queue.action_force_download')"
              :aria-label="t('media.films.queue.action_force_download')"
              data-test="queue-grab"
              @click="forceGrab(item)"
            />
            <v-btn
              :icon="msDelete"
              size="small"
              variant="text"
              color="error"
              :title="t('media.films.queue.action_delete')"
              :aria-label="t('media.films.queue.action_delete')"
              data-test="queue-delete"
              @click="askDelete(item)"
            />
          </div>
          <div
            v-if="deleting === item.id"
            class="queue-item__delete"
            data-test="queue-delete-options"
          >
            <span class="text-body-small font-weight-medium">{{
              t('media.films.queue.delete_msg', { title: item.title })
            }}</span>
            <v-checkbox
              v-model="deleteOptions.removeFromClient"
              :label="t('media.films.queue.delete_remove_client')"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-model="deleteOptions.blocklist"
              :label="t('media.films.queue.delete_blocklist')"
              density="compact"
              hide-details
            />
            <div class="d-flex ga-2">
              <v-btn
                size="small"
                color="error"
                variant="flat"
                data-test="queue-delete-confirm"
                @click="confirmDelete(item)"
                >{{ t('media.films.queue.delete_confirm') }}</v-btn
              >
              <v-btn size="small" variant="text" @click="deleting = null">{{
                t('media.films.queue.delete_cancel')
              }}</v-btn>
            </div>
          </div>
        </div>
      </div>
    </v-expand-transition>
  </v-card>
</template>

<style scoped>
.queue-item__link {
  color: inherit;
  text-decoration: none;
}
.queue-item__link:hover,
.queue-item__link:focus-visible {
  text-decoration: underline;
}
.queue-toggle :deep(.v-btn__prepend) {
  transition: transform 0.2s;
}
.queue-toggle--open :deep(.v-btn__prepend) {
  transform: rotate(90deg);
}
.queue-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 4px 12px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.queue-item:last-child {
  border-bottom: 0;
}
.queue-item__title {
  overflow-wrap: anywhere;
}
.queue-item__actions {
  display: flex;
}
.queue-item__delete {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
@media (max-width: 599px) {
  .queue-item {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .queue-item__status {
    grid-column: 1;
    justify-self: start;
  }
}
</style>
