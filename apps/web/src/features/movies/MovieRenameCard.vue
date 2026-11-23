<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Nommage du fichier dans la fiche (`#film-rename-info` d'origine) : nom actuel
// et nom attendu par Radarr ; sans proposition, le fichier est déjà bien nommé.
// « Renommer » lance `RenameMovie`, suit la commande puis relit la fiche.
import type { MovieDetail } from '@hubarr/shared';
import { mdiCheck, mdiPencil } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { moviesApi, moviesKeys } from './movies-api';
import { useArrCommand } from './useArrCommand';

const props = defineProps<{ slug: string; movie: MovieDetail }>();
const emit = defineEmits<{ renamed: [] }>();
const { t } = useI18n();
const commands = useArrCommand();

const proposals = useQuery({
  queryKey: computed(() => moviesKeys.movieSection(props.slug, props.movie.id, 'rename')),
  queryFn: ({ signal }) => moviesApi.renamePreview(props.slug, props.movie.id, signal),
  retry: false,
});

const currentName = computed(() => props.movie.movieFile?.relativePath ?? '');
const view = computed(() => {
  const list = proposals.data.value;
  if (list === undefined) return null;
  const first = list[0];
  if (first === undefined) {
    // Aucune proposition : le fichier porte déjà le nom attendu.
    return currentName.value === ''
      ? { empty: true as const }
      : { current: currentName.value, expected: currentName.value, correct: true };
  }
  return {
    current: first.existingPath ?? (currentName.value || '—'),
    expected: first.newPath ?? '—',
    correct: first.existingPath === first.newPath,
  };
});

const feedback = ref<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => {
  clearTimeout(timer);
});
const running = ref(false);

async function rename(): Promise<void> {
  if (running.value) return;
  running.value = true;
  clearTimeout(timer);
  feedback.value = { type: 'info', text: t('media.films.detail.rename_launch_start') };
  try {
    const started = await moviesApi.rename(props.slug, props.movie.id);
    if (started.cmdId === null) {
      feedback.value = { type: 'error', text: t('media.films.detail.rename_launch_error') };
      return;
    }
    const result = await commands.follow(props.slug, started.cmdId, () => undefined);
    if (result.outcome === 'completed') {
      feedback.value = { type: 'success', text: t('media.films.detail.rename_success') };
      timer = setTimeout(() => (feedback.value = null), 5_000);
      emit('renamed');
      await proposals.refetch();
    } else if (result.outcome === 'failed') {
      const error = result.status.message ?? t('media.films.detail.unknown_error');
      feedback.value = { type: 'error', text: t('media.films.detail.rename_failed', { error }) };
    }
  } catch {
    feedback.value = { type: 'error', text: t('media.films.detail.network_error') };
  } finally {
    running.value = false;
  }
}

defineExpose({ rename });
</script>

<template>
  <v-card variant="outlined" class="mb-3" data-test="movie-rename">
    <div class="d-flex align-center pa-3 pb-0">
      <h3 class="text-title-small flex-grow-1">{{ t('media.films.detail.file_naming') }}</h3>
      <v-btn
        :prepend-icon="mdiPencil"
        size="small"
        variant="tonal"
        :loading="running"
        data-test="movie-rename-go"
        @click="rename"
        >{{ t('media.films.detail.rename') }}</v-btn
      >
    </div>
    <v-card-text>
      <div v-if="proposals.isPending.value" class="text-body-small text-muted">
        {{ t('media.films.detail.loading_proposals') }}
      </div>
      <div v-else-if="view === null || 'empty' in view" class="text-body-small text-muted">
        {{ t('media.films.detail.no_rename_proposal') }}
      </div>
      <template v-else>
        <div class="text-body-small text-muted">{{ t('media.films.detail.current_name') }}</div>
        <code class="d-block text-body-small text-truncate mb-2" :title="view.current">{{
          view.current
        }}</code>
        <div class="text-body-small text-muted">{{ t('media.films.detail.expected_name') }}</div>
        <code class="d-block text-body-small text-truncate" :title="view.expected">{{
          view.expected
        }}</code>
        <div
          v-if="view.correct"
          class="text-body-small text-success mt-2"
          data-test="movie-rename-correct"
        >
          <v-icon :icon="mdiCheck" size="14" /> {{ t('media.films.detail.already_correct') }}
        </div>
      </template>
      <v-alert v-if="feedback" :type="feedback.type" variant="tonal" density="compact" class="mt-3">
        <div class="d-flex align-center ga-2">
          <v-progress-circular v-if="feedback.type === 'info'" indeterminate size="16" width="2" />
          <span>{{ feedback.text }}</span>
        </div>
      </v-alert>
    </v-card-text>
  </v-card>
</template>
