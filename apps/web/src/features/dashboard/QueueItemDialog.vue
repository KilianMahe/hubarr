<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Gestion d'un élément de la file depuis le tableau de bord (import bloqué,
// avertissement, erreur) : motif donné par Radarr ou Sonarr, import manuel des
// fichiers du téléchargement (correspondance, qualité, langues corrigées),
// suivi de la commande jusqu'à sa fin, ou retrait de la file (client de
// téléchargement, liste de blocage). Un seul dialogue pour les deux services,
// ouvert depuis le tableau de bord ou depuis les pages « File d'attente ».
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorText } from '../../app/api/error-text';
import { useNotifyStore } from '../../app/stores/notify';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { msDelete, msDownload, msOpenInNew, msWarningFill } from '../../components/symbols';
import { moviesApi, moviesKeys } from '../movies/movies-api';
import { useArrCommand } from '../movies/useArrCommand';
import { seriesApi, seriesKeys } from '../series/series-api';
import type { DashboardQueueRow } from './dashboard-queue';
import { QUEUE_STATE_COLORS } from './dashboard-queue';
import {
  episodeImportRequest,
  episodeRows,
  importable,
  movieImportRequest,
  movieRows,
  type ImportRow,
} from './manual-import';
import ManualImportFile from './ManualImportFile.vue';

const props = defineProps<{
  row: DashboardQueueRow;
  /** Ouvert depuis la page de la file : pas de lien vers celle-ci. */
  inQueue?: boolean;
}>();
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const notify = useNotifyStore();
const queryClient = useQueryClient();

const service = computed(() => props.row.service);
const slug = computed(() => props.row.slug);
const queueId = computed(() => props.row.item.id ?? 0);
const apiOf = () => (service.value === 'radarr' ? moviesApi : seriesApi);
const commands = useArrCommand({
  statusOf: (instance, cmdId) => apiOf().commandStatus(instance, cmdId),
});

// ── Aperçu de l'import ──────────────────────────────────────────────────────

// Relu à chaque ouverture, jamais en arrière-plan : les corrections en cours restent.
const preview = useQuery({
  queryKey: computed(() =>
    service.value === 'radarr'
      ? moviesKeys.manualImport(slug.value, queueId.value)
      : seriesKeys.manualImport(slug.value, queueId.value),
  ),
  queryFn: async ({ signal }) =>
    service.value === 'radarr'
      ? movieRows((await moviesApi.manualImportPreview(slug.value, queueId.value, signal)).files)
      : episodeRows((await seriesApi.manualImportPreview(slug.value, queueId.value, signal)).files),
  enabled: computed(() => open.value && queueId.value > 0),
  staleTime: Infinity,
  gcTime: 0,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
});
const rows = ref<ImportRow[]>([]);
watch(
  () => preview.data.value,
  (data) => {
    rows.value = (data ?? []).map((row) => ({ ...row }));
  },
  { immediate: true },
);

const running = ref(false);
const progress = ref<string | null>(null);
const failure = ref<string | null>(null);
const deleting = ref(false);
const deleteOptions = reactive({ removeFromClient: false, blocklist: false });

watch(open, (isOpen) => {
  if (!isOpen) return;
  failure.value = null;
  progress.value = null;
  deleting.value = false;
  Object.assign(deleteOptions, { removeFromClient: false, blocklist: false });
  if (preview.data.value !== undefined) void preview.refetch();
});

const selected = computed(() => importable(rows.value, service.value));
const queueKey = () =>
  service.value === 'radarr' ? moviesKeys.queue(slug.value) : seriesKeys.queue(slug.value);
const reasons = computed(() =>
  props.row.item.statusMessages.flatMap((message) =>
    message.messages.length > 0
      ? message.messages.map((text) => ({ title: message.title, text }))
      : [{ title: message.title, text: '' }],
  ),
);

// ── Actions ─────────────────────────────────────────────────────────────────

async function runImport(): Promise<void> {
  if (selected.value.length === 0) return;
  running.value = true;
  failure.value = null;
  progress.value = null;
  try {
    const started =
      service.value === 'radarr'
        ? await moviesApi.manualImport(slug.value, queueId.value, movieImportRequest(rows.value))
        : await seriesApi.manualImport(slug.value, queueId.value, episodeImportRequest(rows.value));
    if (started.cmdId === null) throw new Error('no command');
    const result = await commands.follow(slug.value, started.cmdId, ({ status }) => {
      progress.value = status.message;
    });
    if (result.outcome === 'completed') {
      notify.success('dashboard.queue.manage.import_done', { title: props.row.title });
      await queryClient.invalidateQueries({ queryKey: queueKey() });
      open.value = false;
    } else if (result.outcome === 'failed') {
      failure.value = result.status.message ?? t('dashboard.queue.manage.import_failed');
    }
  } catch (error) {
    failure.value = apiErrorText(error, t, 'dashboard.queue.manage.import_failed');
  } finally {
    running.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  running.value = true;
  failure.value = null;
  try {
    await apiOf().queueDelete(slug.value, queueId.value, {
      ...deleteOptions,
      skipRedownload: false,
    });
    notify.success('dashboard.queue.manage.removed', { title: props.row.title });
    await queryClient.invalidateQueries({ queryKey: queueKey() });
    open.value = false;
  } catch (error) {
    failure.value = apiErrorText(error, t, 'dashboard.queue.manage.remove_failed');
  } finally {
    running.value = false;
  }
}

function updateRow(index: number, value: ImportRow): void {
  rows.value = rows.value.map((row, position) => (position === index ? value : row));
}
</script>

<template>
  <ResponsiveDialog v-model="open" :title="row.title" :max-width="860">
    <div data-test="queue-manage">
      <div class="d-flex flex-wrap align-center ga-2 mb-3">
        <v-chip size="small" variant="tonal" :color="QUEUE_STATE_COLORS[row.state]">{{
          t(`dashboard.queue.state.${row.state}`)
        }}</v-chip>
        <span class="text-body-medium text-muted">{{
          [row.detail, row.instance].filter(Boolean).join(' · ')
        }}</span>
        <v-spacer />
        <v-btn
          v-if="!inQueue"
          :to="{
            name: row.service === 'radarr' ? 'radarr-queue' : 'sonarr-queue',
            params: { slug: row.slug },
          }"
          :append-icon="msOpenInNew"
          variant="text"
          size="small"
          data-test="queue-manage-open"
          >{{ t('dashboard.queue.manage.open_queue') }}</v-btn
        >
      </div>

      <h3 class="text-title-small mb-1">{{ t('dashboard.queue.manage.reason') }}</h3>
      <div v-if="reasons.length === 0" class="text-body-medium text-muted mb-3">
        {{ t('dashboard.queue.manage.no_reason') }}
      </div>
      <ul v-else class="manage-reasons mb-3" data-test="queue-manage-reasons">
        <li v-for="(reason, index) in reasons" :key="index" class="text-body-medium">
          <v-icon :icon="msWarningFill" size="14" color="warning" class="me-1" />
          {{
            reason.title && reason.text
              ? t('dashboard.queue.manage.reason_line', reason)
              : reason.title || reason.text
          }}
        </li>
      </ul>

      <h3 class="text-title-small mb-1">{{ t('dashboard.queue.manage.files') }}</h3>
      <p class="text-body-small text-muted mb-2">{{ t('dashboard.queue.manage.files_help') }}</p>
      <v-progress-linear v-if="preview.isPending.value" indeterminate color="primary" />
      <v-alert
        v-else-if="preview.isError.value"
        type="error"
        variant="tonal"
        density="compact"
        data-test="queue-manage-preview-error"
        >{{
          apiErrorText(preview.error.value, t, 'dashboard.queue.manage.preview_failed')
        }}</v-alert
      >
      <p
        v-else-if="rows.length === 0"
        class="text-body-medium text-muted"
        data-test="queue-manage-empty"
      >
        {{ t('dashboard.queue.manage.no_files') }}
      </p>
      <div v-else class="d-flex flex-column ga-2">
        <ManualImportFile
          v-for="(file, index) in rows"
          :key="file.path"
          :row="file"
          :service="row.service"
          :slug="row.slug"
          @update:row="updateRow(index, $event)"
        />
      </div>

      <div
        v-if="running && progress"
        class="text-body-small mt-3"
        data-test="queue-manage-progress"
      >
        {{ progress }}
      </div>
      <v-alert
        v-if="failure"
        type="error"
        variant="tonal"
        density="compact"
        class="mt-3"
        data-test="queue-manage-error"
        >{{ failure }}</v-alert
      >

      <div v-if="deleting" class="manage-delete mt-3" data-test="queue-manage-delete-options">
        <div class="text-body-medium font-weight-medium">
          {{ t('dashboard.queue.manage.remove_title', { title: row.title }) }}
        </div>
        <v-checkbox
          v-model="deleteOptions.removeFromClient"
          :label="t('dashboard.queue.manage.remove_client')"
          density="compact"
          hide-details
          data-test="queue-manage-remove-client"
        />
        <v-checkbox
          v-model="deleteOptions.blocklist"
          :label="t('dashboard.queue.manage.remove_blocklist')"
          density="compact"
          hide-details
          data-test="queue-manage-blocklist"
        />
        <div class="d-flex flex-wrap ga-2 mt-1">
          <v-btn
            color="error"
            variant="flat"
            size="small"
            :loading="running"
            data-test="queue-manage-remove-confirm"
            @click="confirmDelete"
            >{{ t('dashboard.queue.manage.remove_confirm') }}</v-btn
          >
          <v-btn variant="text" size="small" @click="deleting = false">{{
            t('dashboard.queue.manage.cancel')
          }}</v-btn>
        </div>
      </div>
    </div>

    <template #actions>
      <v-btn
        :prepend-icon="msDelete"
        color="error"
        variant="text"
        :disabled="running || deleting"
        data-test="queue-manage-remove"
        @click="deleting = true"
        >{{ t('dashboard.queue.manage.remove') }}</v-btn
      >
      <v-btn
        :prepend-icon="msDownload"
        color="primary"
        variant="flat"
        :disabled="selected.length === 0 || deleting"
        :loading="running && !deleting"
        data-test="queue-manage-import"
        @click="runImport"
        >{{ t('dashboard.queue.manage.import', { count: selected.length }) }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.manage-reasons {
  list-style: none;
  padding: 0;
}
.manage-reasons li {
  overflow-wrap: anywhere;
}
.manage-delete {
  padding: 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
