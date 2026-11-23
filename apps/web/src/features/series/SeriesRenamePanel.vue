<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Renommage des fichiers d'une série ou d'une saison (`btn-serie-rename`,
// `btn-season-rename`) : propositions (nom actuel → nouveau nom), cases (toutes
// cochées), compteur, « Renommer la sélection » ; la commande `RenameFiles` est
// suivie jusqu'au bilan, puis la fiche est relue. « Tous les fichiers sont déjà
// correctement nommés » sans proposition.
import type { SeriesRenameProposal } from '@hubarr/shared';
import { mdiCheckCircle } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useArrCommand } from '../movies/useArrCommand';
import { seriesApi, seriesKeys } from './series-api';
import { proposalCode } from './series-detail';

const props = defineProps<{ slug: string; seriesId: number; season?: number | null }>();
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();
const commands = useArrCommand({ statusOf: seriesApi.commandStatus });

const proposals = useQuery({
  queryKey: computed(() => seriesKeys.seriesSection(props.slug, props.seriesId, 'rename')),
  queryFn: ({ signal }) => seriesApi.renamePreview(props.slug, props.seriesId, signal),
  staleTime: 0,
  retry: false,
});
const rows = computed<SeriesRenameProposal[]>(() => {
  const all = proposals.data.value ?? [];
  return props.season === undefined || props.season === null
    ? all
    : all.filter((proposal) => proposal.seasonNumber === props.season);
});

const checked = ref<number[]>([]);
watch(
  rows,
  (value) => {
    checked.value = value.flatMap((row) => (row.episodeFileId === null ? [] : [row.episodeFileId]));
  },
  { immediate: true },
);
const allChecked = computed(
  () => rows.value.length > 0 && checked.value.length === rows.value.length,
);
function toggleAll(value: boolean | null): void {
  checked.value = value
    ? rows.value.flatMap((row) => (row.episodeFileId === null ? [] : [row.episodeFileId]))
    : [];
}

const feedback = ref<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
const running = ref(false);

async function rename(): Promise<void> {
  if (checked.value.length === 0) {
    feedback.value = { type: 'warning', text: t('media.series.detail.no_file_selected') };
    return;
  }
  running.value = true;
  feedback.value = null;
  const count = checked.value.length;
  try {
    const started = await seriesApi.rename(props.slug, props.seriesId, [...checked.value]);
    if (started.cmdId === null) {
      feedback.value = { type: 'error', text: t('media.series.detail.rename_error') };
      return;
    }
    const result = await commands.follow(props.slug, started.cmdId, () => undefined);
    if (result.outcome === 'completed') {
      feedback.value = {
        type: 'success',
        text: t('media.series.detail.rename_done_tpl', { count }),
      };
      emit('done');
    } else if (result.outcome === 'failed') {
      feedback.value = { type: 'error', text: t('media.series.detail.rename_failed') };
    }
  } catch {
    feedback.value = { type: 'error', text: t('media.series.detail.network_error') };
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div data-test="series-rename">
    <v-progress-linear v-if="proposals.isPending.value" indeterminate color="service" />
    <p v-else-if="proposals.isError.value" class="text-error text-body-small pa-3">
      {{ t('media.series.detail.load_proposals_error') }}
    </p>
    <p
      v-else-if="rows.length === 0"
      class="text-success text-body-small pa-3 d-flex align-center ga-2"
      data-test="series-rename-correct"
    >
      <v-icon :icon="mdiCheckCircle" size="16" />{{ t('media.series.detail.all_files_correct') }}
    </p>
    <template v-else>
      <v-table density="compact" class="series-rename">
        <thead>
          <tr>
            <th style="width: 40px">
              <v-checkbox-btn
                :model-value="allChecked"
                color="service"
                :aria-label="t('media.series.bulk.select_all')"
                @update:model-value="toggleAll"
              />
            </th>
            <th>{{ t('media.series.detail.col_episode') }}</th>
            <th>{{ t('media.series.detail.col_current_name') }}</th>
            <th>{{ t('media.series.detail.col_new_name') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.episodeFileId ?? row.existingPath ?? ''">
            <td>
              <v-checkbox-btn
                v-if="row.episodeFileId !== null"
                v-model="checked"
                :value="row.episodeFileId"
                color="service"
                :aria-label="proposalCode(row)"
              />
            </td>
            <td class="font-weight-medium text-no-wrap">{{ proposalCode(row) }}</td>
            <td class="series-rename__path text-error" :title="row.existingPath ?? ''">
              {{ row.existingPath ?? '—' }}
            </td>
            <td class="series-rename__path text-success" :title="row.newPath ?? ''">
              {{ row.newPath ?? '—' }}
            </td>
          </tr>
        </tbody>
      </v-table>
      <div class="d-flex align-center ga-2 pa-3">
        <span class="text-body-small text-muted">{{
          t('media.series.detail.files_selected_tpl', { count: checked.length })
        }}</span>
        <v-spacer />
        <v-btn
          color="service"
          variant="flat"
          size="small"
          :loading="running"
          data-test="series-rename-go"
          @click="rename"
          >{{ t('media.series.detail.rename_selection') }}</v-btn
        >
      </div>
    </template>
    <v-alert
      v-if="feedback"
      :type="feedback.type"
      variant="tonal"
      density="compact"
      class="ma-3"
      data-test="series-rename-feedback"
      >{{ feedback.text }}</v-alert
    >
  </div>
</template>

<style scoped>
.series-rename {
  font-size: 0.8rem;
}
.series-rename__path {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}
</style>
