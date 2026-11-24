<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// File d'attente de la page Séries (`#queue-card` de `series.html.twig`) :
// repliée, masquée si vide, compteur ; relue toutes les 2 s (suspendue onglet
// caché), `RefreshMonitoredDownloads` un tour sur trois. Ligne : série et
// épisode, qualité, progression, statut et premier message ; forcer le
// téléchargement (délai, file), supprimer (client, sans liste de blocage).
// Bandeau des éléments en avertissement : nettoyer les « déjà importés »,
// importer les autres (aperçu de Sonarr) avec le bilan et ses motifs.
// `standalone` (onglet « File d'attente », P5c.6, V18) : toujours dépliée,
// affichée même vide ; la série mène à sa fiche ; « Actualiser » et
// « Scanner » la série depuis la ligne.
import type { SeriesQueueItem } from '@hubarr/shared';
import {
  msClose,
  msDownload,
  msFolderOpen,
  msKeyboardArrowDown,
  msRefresh,
} from '../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import { mediaDetailLocation } from '../../app/media-links';
import { queueActions, queueProgress } from '../movies/queue';
import { seriesSize } from './library';
import { seriesApi, seriesKeys } from './series-api';
import {
  SERIES_QUEUE_POLL_MS,
  SERIES_QUEUE_REFRESH_EVERY,
  SERIES_QUEUE_TONE_COLORS,
  classifyQueueWarnings,
  formatImportReasons,
  seriesIdsOf,
  seriesLeftQueue,
  seriesQueueTone,
  statusMessagesText,
} from './series-queue';
import { useLiveQuery } from '../../app/live';
import { useNotifyStore } from '../../app/stores/notify';

const props = defineProps<{ slug: string; standalone?: boolean }>();
const emit = defineEmits<{
  /** Séries sorties de la file (importées) : la bibliothèque doit être relue. */
  left: [seriesIds: number[]];
  /** Bilan à afficher dans la bannière de la page. */
  notice: [type: 'success' | 'warning' | 'error', text: string];
}>();
const { t } = useI18n();
const notify = useNotifyStore();

let tick = 0;
const queue = useQuery({
  queryKey: computed(() => seriesKeys.queue(props.slug)),
  queryFn: async ({ signal }) => {
    tick += 1;
    // Sonarr relit ses clients de téléchargement toutes les 6 s (l'original : minuteur à part).
    if (tick % SERIES_QUEUE_REFRESH_EVERY === 0)
      void seriesApi.queueRefresh(props.slug).catch(() => undefined);
    return seriesApi.queue(props.slug, signal);
  },
  refetchInterval: useLiveQuery({
    topic: () => `queue.sonarr.${props.slug}`,
    queryKey: () => seriesKeys.queue(props.slug),
    fallbackMs: SERIES_QUEUE_POLL_MS,
  }),
  retry: false,
});
const items = computed<SeriesQueueItem[]>(() => queue.data.value ?? []);
const expanded = ref(props.standalone);

let previous: Set<number> | null = null;
watch(items, (list) => {
  if (previous !== null) {
    const left = seriesLeftQueue(previous, list);
    if (left.length > 0) emit('left', left);
  }
  previous = seriesIdsOf(list);
});

const warnings = computed(() => classifyQueueWarnings(items.value));
const busy = ref<Record<string, boolean>>({});
const refetch = () => queue.refetch();

/** Actualiser ou scanner la série d'une ligne (V18). */
async function seriesCommand(item: SeriesQueueItem, kind: 'refresh' | 'rescan'): Promise<void> {
  if (item.seriesId === null) return;
  const key = `${kind}${item.id ?? item.seriesId}`;
  const name = `${t(`media.queue_page.${kind}`)} · ${item.seriesTitle}`;
  busy.value = { ...busy.value, [key]: true };
  try {
    await (kind === 'refresh' ? seriesApi.refresh : seriesApi.rescan)(props.slug, item.seriesId);
    notify.success('server.command_started', { name });
  } catch {
    notify.error('server.command_error', { name });
  } finally {
    busy.value = { ...busy.value, [key]: false };
  }
}

async function grab(item: SeriesQueueItem): Promise<void> {
  if (item.id === null) return;
  busy.value = { ...busy.value, [`grab${item.id}`]: true };
  try {
    await seriesApi.queueGrab(props.slug, item.id);
    await refetch();
  } catch {
    emit('notice', 'error', t('media.series.queue.error'));
  } finally {
    busy.value = { ...busy.value, [`grab${item.id}`]: false };
  }
}

// La cible survit à la fermeture du dialogue, qui précède l'émission de `confirm`.
const toDelete = ref<SeriesQueueItem | null>(null);
const deleteOpen = ref(false);
function askDelete(item: SeriesQueueItem): void {
  toDelete.value = item;
  deleteOpen.value = true;
}
async function confirmDelete(): Promise<void> {
  const item = toDelete.value;
  if (item?.id === null || item?.id === undefined) return;
  try {
    await seriesApi.queueDelete(props.slug, item.id, { removeFromClient: true, blocklist: false });
    await refetch();
  } catch {
    emit('notice', 'error', t('media.series.queue.error'));
  }
}

const cleanOpen = ref(false);
const cleaning = ref(false);
async function cleanStale(): Promise<void> {
  cleaning.value = true;
  const targets = warnings.value.stale.flatMap((item) => (item.id === null ? [] : [item.id]));
  await Promise.allSettled(
    targets.map((id) =>
      seriesApi.queueDelete(props.slug, id, { removeFromClient: true, blocklist: false }),
    ),
  );
  cleaning.value = false;
  await refetch();
}

const importing = ref(false);
async function importBlocked(): Promise<void> {
  importing.value = true;
  const payload = warnings.value.blocked
    .map((item) => ({ path: item.outputPath ?? '', downloadId: item.downloadId ?? '' }))
    .filter((item) => item.path !== '' || item.downloadId !== '');
  try {
    const result = await seriesApi.queueImport(props.slug, { items: payload });
    const total = result.imported + result.skipped;
    const reasons = formatImportReasons(result.reasons);
    if (result.ok && result.imported > 0 && result.skipped === 0) {
      emit(
        'notice',
        'success',
        t('media.series.queue.import_done_tpl', { IMPORTED: result.imported }),
      );
      setTimeout(() => void refetch(), 3_000);
    } else if (result.imported > 0) {
      emit(
        'notice',
        'warning',
        t('media.series.queue.import_partial_tpl', {
          IMPORTED: result.imported,
          TOTAL: total,
          SKIPPED: result.skipped,
          REASONS: reasons,
        }),
      );
      setTimeout(() => void refetch(), 3_000);
    } else {
      emit(
        'notice',
        'error',
        total > 0
          ? t('media.series.queue.import_none_tpl', { TOTAL: total, REASONS: reasons })
          : t('media.series.queue.error'),
      );
    }
  } catch {
    emit('notice', 'error', t('media.series.queue.error'));
  } finally {
    importing.value = false;
  }
}

function statusLabel(item: SeriesQueueItem): string {
  return item.trackedState === 'importing'
    ? t('media.series.queue.status_import')
    : item.status || '—';
}
</script>

<template>
  <v-card
    v-if="items.length > 0 || standalone"
    variant="flat"
    border
    class="mb-3"
    data-test="series-queue"
  >
    <EmptyState
      v-if="standalone && items.length === 0 && !queue.isPending.value"
      inline
      :title="t('media.queue_page.empty')"
    />
    <button
      v-if="!standalone"
      type="button"
      class="series-queue__header"
      :aria-expanded="expanded"
      data-test="series-queue-toggle"
      @click="expanded = !expanded"
    >
      <v-icon
        :icon="msKeyboardArrowDown"
        size="18"
        class="series-queue__chevron"
        :class="{ 'series-queue__chevron--open': expanded }"
      />
      <v-icon :icon="msDownload" size="18" />
      <span class="text-title-small">{{ t('media.series.queue.title') }}</span>
      <v-chip size="x-small" color="service" variant="flat" data-test="series-queue-count">{{
        items.length
      }}</v-chip>
    </button>
    <template v-if="expanded && items.length > 0">
      <v-alert
        v-if="warnings.stale.length > 0 || warnings.blocked.length > 0"
        type="warning"
        variant="tonal"
        density="compact"
        rounded="0"
        data-test="series-queue-warnings"
      >
        <div class="d-flex flex-wrap align-center ga-2">
          <span>
            <strong v-if="warnings.stale.length > 0">{{
              t('media.series.queue.warning_already_imported', { count: warnings.stale.length })
            }}</strong>
            <template v-if="warnings.stale.length > 0 && warnings.blocked.length > 0"> + </template>
            <strong v-if="warnings.blocked.length > 0" class="text-error">{{
              t('media.series.queue.warning_imports_pending', { count: warnings.blocked.length })
            }}</strong>
          </span>
          <v-spacer />
          <v-btn
            v-if="warnings.stale.length > 0"
            size="small"
            color="warning"
            variant="flat"
            :loading="cleaning"
            data-test="series-queue-clean"
            @click="cleanOpen = true"
            >{{ t('media.series.queue.clean_duplicates', { count: warnings.stale.length }) }}</v-btn
          >
          <v-btn
            v-if="warnings.blocked.length > 0"
            size="small"
            color="service"
            variant="flat"
            :loading="importing"
            data-test="series-queue-import"
            @click="importBlocked"
            >{{ t('media.series.queue.import_files', { count: warnings.blocked.length }) }}</v-btn
          >
        </div>
      </v-alert>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t('media.series.queue.col_series_episode') }}</th>
            <th>{{ t('media.series.queue.col_quality') }}</th>
            <th>{{ t('media.series.queue.col_progress') }}</th>
            <th>{{ t('media.series.queue.col_status') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in items" :key="item.id ?? index" data-test="series-queue-row">
            <td>
              <router-link
                v-if="item.seriesId !== null"
                :to="mediaDetailLocation('sonarr', slug, item.seriesId)"
                class="font-weight-medium series-queue__link"
                :title="t('media.queue_page.open_series')"
                data-test="series-queue-open"
                >{{ item.seriesTitle }}</router-link
              >
              <div v-else class="font-weight-medium">{{ item.seriesTitle }}</div>
              <div class="text-body-small text-muted">{{ item.episode }}</div>
            </td>
            <td>
              <v-chip size="x-small" label variant="tonal" color="info">{{ item.quality }}</v-chip>
            </td>
            <td class="series-queue__progress">
              <div class="d-flex align-center ga-2">
                <v-progress-linear
                  :model-value="queueProgress(item)"
                  color="service"
                  height="6"
                  rounded
                />
                <span class="text-body-small text-muted">{{ queueProgress(item) }}%</span>
              </div>
              <div class="text-body-small text-muted">
                {{ seriesSize(t, item.size - item.sizeleft) }} / {{ seriesSize(t, item.size) }}
              </div>
            </td>
            <td>
              <v-chip
                size="x-small"
                label
                variant="tonal"
                :color="SERIES_QUEUE_TONE_COLORS[seriesQueueTone(item)]"
                >{{ statusLabel(item) }}</v-chip
              >
              <div
                v-if="item.statusMessages.length > 0"
                class="text-body-small text-error series-queue__message"
                :title="statusMessagesText(item)"
              >
                {{ item.statusMessages[0]?.title }}
              </div>
            </td>
            <td class="text-end text-no-wrap">
              <template v-if="standalone && item.seriesId !== null">
                <v-btn
                  :icon="msRefresh"
                  size="small"
                  variant="text"
                  :loading="busy[`refresh${item.id ?? item.seriesId}`]"
                  :aria-label="t('media.queue_page.refresh')"
                  :title="t('media.queue_page.refresh')"
                  data-test="series-queue-refresh"
                  @click="seriesCommand(item, 'refresh')"
                />
                <v-btn
                  :icon="msFolderOpen"
                  size="small"
                  variant="text"
                  :loading="busy[`rescan${item.id ?? item.seriesId}`]"
                  :aria-label="t('media.queue_page.rescan')"
                  :title="t('media.queue_page.rescan')"
                  data-test="series-queue-rescan"
                  @click="seriesCommand(item, 'rescan')"
                />
              </template>
              <v-btn
                v-if="queueActions(item).grab"
                :icon="msDownload"
                size="small"
                variant="text"
                color="success"
                :loading="busy[`grab${item.id}`]"
                :aria-label="t('media.series.queue.force_download')"
                :title="t('media.series.queue.force_download')"
                data-test="series-queue-grab"
                @click="grab(item)"
              />
              <v-btn
                :icon="msClose"
                size="small"
                variant="text"
                color="error"
                :aria-label="t('media.series.queue.delete_from_queue')"
                :title="t('media.series.queue.delete_from_queue')"
                data-test="series-queue-delete"
                @click="askDelete(item)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>
    <ConfirmDialog
      v-model="deleteOpen"
      :message="t('media.series.queue.confirm_delete')"
      @confirm="confirmDelete"
    />
    <ConfirmDialog
      v-model="cleanOpen"
      :message="t('media.series.queue.confirm_clean', { count: warnings.stale.length })"
      @confirm="cleanStale"
    />
  </v-card>
</template>

<style scoped>
.series-queue__link {
  color: inherit;
  text-decoration: none;
}
.series-queue__link:hover,
.series-queue__link:focus-visible {
  text-decoration: underline;
}
.series-queue__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.series-queue__chevron {
  transition: transform 0.2s;
  transform: rotate(-90deg);
}
.series-queue__chevron--open {
  transform: rotate(0deg);
}
.series-queue__progress {
  min-width: 140px;
}
.series-queue__message {
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
