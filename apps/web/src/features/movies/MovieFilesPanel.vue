<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Gestionnaire de fichiers de la fiche (`#film-filemanager` d'origine), chargé
// à l'ouverture du panneau : par fichier, groupe de release, qualité et langues
// modifiables (« Sauvegarder » n'apparaît qu'après une modification), renommer,
// supprimer du disque. Sans fichier : le chemin attendu.
import type { MovieDetail, MovieFile } from '@hubarr/shared';
import { mdiContentSave, mdiDelete, mdiPencil } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import {
  draftOf,
  isDirty,
  languageChoices,
  qualityChoicesFor,
  type FileDraft,
} from './movie-detail';
import { moviesApi, moviesKeys } from './movies-api';

const props = defineProps<{ slug: string; movie: MovieDetail }>();
const emit = defineEmits<{
  /** Fichier modifié ou supprimé : la fiche et la bibliothèque se rechargent. */
  changed: [kind: 'updated' | 'deleted'];
  rename: [];
}>();
const { t } = useI18n();
const format = useFormat();

const files = useQuery({
  queryKey: computed(() => moviesKeys.movieSection(props.slug, props.movie.id, 'files')),
  queryFn: ({ signal }) => moviesApi.files(props.slug, props.movie.id, signal),
  retry: false,
});
const qualities = useQuery({
  queryKey: computed(() => moviesKeys.qualityDefinitions(props.slug)),
  queryFn: ({ signal }) => moviesApi.qualityDefinitions(props.slug, signal),
  staleTime: 300_000,
  retry: false,
});

const drafts = reactive(new Map<number, FileDraft>());
watch(
  () => files.data.value,
  (list) => {
    drafts.clear();
    for (const file of list ?? []) drafts.set(file.id, draftOf(file));
  },
  { immediate: true },
);

const feedback = ref<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
function notify(type: 'success' | 'error' | 'warning', text: string): void {
  clearTimeout(feedbackTimer);
  feedback.value = { type, text };
  if (type === 'success') feedbackTimer = setTimeout(() => (feedback.value = null), 4_000);
}

const busy = reactive({ saving: 0, deleting: 0 });

async function save(file: MovieFile): Promise<void> {
  const draft = drafts.get(file.id);
  if (draft === undefined) return;
  const languages = languageChoices(file).filter((language) =>
    draft.languageIds.includes(language.id),
  );
  if (languages.length === 0) {
    notify('warning', t('media.films.detail.pick_language'));
    return;
  }
  busy.saving = file.id;
  try {
    await moviesApi.updateFile(props.slug, file.id, {
      qualityId: draft.qualityId,
      languages,
      releaseGroup: draft.releaseGroup,
    });
    notify('success', t('media.films.detail.saved'));
    await files.refetch();
    emit('changed', 'updated');
  } catch {
    notify(
      'error',
      t('media.films.detail.save_error', { error: t('media.films.detail.unknown_error') }),
    );
  } finally {
    busy.saving = 0;
  }
}

// La cible reste posée après la fermeture du dialogue (il se ferme avant `confirm`).
const deleteTarget = ref<MovieFile | null>(null);
const deleteOpen = ref(false);
function askDelete(file: MovieFile): void {
  deleteTarget.value = file;
  deleteOpen.value = true;
}
async function confirmDelete(file: MovieFile): Promise<void> {
  busy.deleting = file.id;
  try {
    await moviesApi.deleteFile(props.slug, file.id);
    notify('success', t('media.films.detail.file_deleted'));
    await files.refetch();
    emit('changed', 'deleted');
  } catch {
    notify('error', t('media.films.detail.delete_error'));
  } finally {
    busy.deleting = 0;
  }
}

function toggleLanguage(draft: FileDraft, id: number): void {
  draft.languageIds = draft.languageIds.includes(id)
    ? draft.languageIds.filter((value) => value !== id)
    : [...draft.languageIds, id];
}
</script>

<template>
  <div data-test="movie-files">
    <v-progress-linear v-if="files.isPending.value" indeterminate color="service" class="my-2" />
    <v-alert v-else-if="files.isError.value" type="error" variant="tonal" density="compact">{{
      t('media.films.detail.loading_error_short')
    }}</v-alert>
    <div v-else-if="(files.data.value ?? []).length === 0" class="text-body-medium">
      <p class="text-muted mb-2">{{ t('media.films.detail.no_file_associated') }}</p>
      <template v-if="movie.path">
        <div class="font-weight-medium mb-1">{{ t('media.films.detail.expected_path') }}</div>
        <code class="movie-files__path">{{ movie.path }}</code>
      </template>
    </div>
    <template v-else>
      <div
        v-for="(file, index) in files.data.value ?? []"
        :key="file.id"
        class="movie-files__file"
        :class="{ 'movie-files__file--sep': index > 0 }"
        data-test="movie-file"
      >
        <div class="d-flex justify-space-between align-start ga-2 mb-3">
          <code class="text-body-small text-truncate" :title="file.relativePath ?? ''">{{
            file.relativePath ?? '—'
          }}</code>
          <span class="text-body-small text-muted text-no-wrap">{{
            file.size > 0 ? format.bytes(file.size) : '—'
          }}</span>
        </div>
        <template v-if="drafts.get(file.id)">
          <v-row density="compact">
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="drafts.get(file.id)!.releaseGroup"
                :label="t('media.films.detail.release_group')"
                :placeholder="t('media.films.detail.release_group_placeholder')"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="drafts.get(file.id)!.qualityId"
                :items="qualityChoicesFor(file, qualities.data.value ?? [])"
                item-value="id"
                item-title="name"
                :label="t('media.films.detail.quality')"
                :loading="qualities.isPending.value"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
          </v-row>
          <div class="text-body-small text-muted mt-3 mb-1">
            {{ t('media.films.detail.languages') }}
          </div>
          <div class="d-flex flex-wrap ga-1">
            <v-chip
              v-for="language in languageChoices(file)"
              :key="language.id"
              size="small"
              :variant="
                drafts.get(file.id)!.languageIds.includes(language.id) ? 'flat' : 'outlined'
              "
              :color="
                drafts.get(file.id)!.languageIds.includes(language.id) ? 'service' : undefined
              "
              :aria-pressed="drafts.get(file.id)!.languageIds.includes(language.id)"
              @click="toggleLanguage(drafts.get(file.id)!, language.id)"
              >{{ language.name }}</v-chip
            >
          </div>
          <div class="d-flex flex-wrap align-center ga-2 mt-3">
            <v-btn
              v-if="isDirty(file, drafts.get(file.id)!)"
              :prepend-icon="mdiContentSave"
              color="service"
              variant="flat"
              size="small"
              :loading="busy.saving === file.id"
              data-test="movie-file-save"
              @click="save(file)"
              >{{ t('media.films.detail.save') }}</v-btn
            >
            <v-btn :prepend-icon="mdiPencil" variant="tonal" size="small" @click="emit('rename')">{{
              t('media.films.detail.rename')
            }}</v-btn>
            <v-spacer />
            <v-btn
              :prepend-icon="mdiDelete"
              color="error"
              variant="tonal"
              size="small"
              :loading="busy.deleting === file.id"
              data-test="movie-file-delete"
              @click="askDelete(file)"
              >{{ t('media.films.detail.delete_file_btn') }}</v-btn
            >
          </div>
        </template>
      </div>
    </template>
    <v-alert
      v-if="feedback"
      :type="feedback.type"
      variant="tonal"
      density="compact"
      class="mt-3"
      data-test="movie-files-feedback"
      >{{ feedback.text }}</v-alert
    >
    <ConfirmDialog
      v-model="deleteOpen"
      :message="t('media.films.detail.delete_file_confirm')"
      :confirm-label="t('media.films.detail.delete_file_btn')"
      danger
      @confirm="deleteTarget && confirmDelete(deleteTarget)"
    />
  </div>
</template>

<style scoped>
.movie-files__file {
  padding: 12px 0;
}
.movie-files__file--sep {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.movie-files__path {
  display: block;
  padding: 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  word-break: break-all;
}
</style>
