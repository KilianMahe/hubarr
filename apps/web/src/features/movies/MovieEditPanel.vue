<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Édition d'un film dans la fiche (`#film-edit-card` d'origine) : suivi,
// disponibilité minimale, profil de qualité, chemin (avec explorateur des
// dossiers de l'instance et mise à jour immédiate), étiquettes (création à la
// volée). « Supprimer » ouvre la suppression de la fiche.
import {
  MINIMUM_AVAILABILITIES,
  type ArrConfigResponse,
  type ArrTag,
  type MovieDetail,
  type MovieEditRequest,
} from '@hubarr/shared';
import { msAdd } from '../../components/symbols';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FolderPathField from '../../components/FolderPathField.vue';
import { moviesApi } from './movies-api';

const props = defineProps<{
  slug: string;
  movie: MovieDetail;
  config: ArrConfigResponse | undefined;
  saving: boolean;
}>();
const emit = defineEmits<{
  save: [changes: MovieEditRequest];
  updatePath: [path: string];
  delete: [];
  cancel: [];
}>();
const { t } = useI18n();

interface EditForm {
  monitored: boolean;
  minimumAvailability: (typeof MINIMUM_AVAILABILITIES)[number];
  qualityProfileId: number;
  path: string;
  tags: number[];
}
const form = reactive<EditForm>({
  monitored: true,
  minimumAvailability: 'released',
  qualityProfileId: 0,
  path: '',
  tags: [],
});
function reset(): void {
  const availability = MINIMUM_AVAILABILITIES.find((v) => v === props.movie.minimumAvailability);
  Object.assign(form, {
    monitored: props.movie.monitored,
    minimumAvailability: availability ?? 'released',
    qualityProfileId: props.movie.qualityProfileId ?? 0,
    path: props.movie.path ?? '',
    tags: [...props.movie.tags],
  });
}
watch(() => props.movie, reset, { immediate: true });

const AVAILABILITY_KEYS = {
  announced: 'media.films.status.announced',
  inCinemas: 'media.films.status.in_cinemas',
  released: 'media.films.bulk.availability_released',
} as const;
const availabilityItems = computed(() =>
  MINIMUM_AVAILABILITIES.map((value) => ({ value, title: t(AVAILABILITY_KEYS[value]) })),
);
const profileItems = computed(() =>
  (props.config?.qualityProfiles ?? []).map((profile) => ({
    value: profile.id,
    title: profile.name,
  })),
);

// ── Étiquettes ──────────────────────────────────────────────────────────────
const createdTags = ref<ArrTag[]>([]);
const allTags = computed(() => [...(props.config?.tags ?? []), ...createdTags.value]);
function toggleTag(id: number): void {
  form.tags = form.tags.includes(id) ? form.tags.filter((tag) => tag !== id) : [...form.tags, id];
}
const newTag = ref('');
const addingTag = ref(false);
async function addTag(): Promise<void> {
  const label = newTag.value.trim();
  if (label === '') return;
  newTag.value = '';
  addingTag.value = true;
  try {
    const { tag } = await moviesApi.createTag(props.slug, label);
    createdTags.value = [...createdTags.value, tag];
    form.tags = [...form.tags, tag.id];
  } catch {
    // L'original ignorait l'échec ; l'étiquette n'est simplement pas ajoutée.
  } finally {
    addingTag.value = false;
  }
}

const loadFolders = (path: string) => moviesApi.filesystem(props.slug, path);
const FOLDER_KEYS = {
  explorer: 'media.films.detail.edit_explorer',
  update: 'media.films.detail.edit_update_path',
  empty: 'media.films.detail.edit_empty_folder',
  confirm: 'media.films.detail.edit_update_path_confirm',
};

function save(): void {
  emit('save', {
    monitored: form.monitored,
    minimumAvailability: form.minimumAvailability,
    ...(form.qualityProfileId > 0 ? { qualityProfileId: form.qualityProfileId } : {}),
    ...(form.path.trim() !== '' ? { path: form.path.trim() } : {}),
    tags: form.tags,
  });
}
</script>

<template>
  <div class="movie-edit" data-test="movie-edit">
    <v-checkbox
      v-model="form.monitored"
      :label="t('media.films.detail.edit_monitored')"
      :hint="t('media.films.detail.edit_monitored_help')"
      persistent-hint
      density="compact"
      color="service"
      class="mb-3"
    />
    <v-select
      v-model="form.minimumAvailability"
      :items="availabilityItems"
      :label="t('media.films.detail.edit_availability')"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-3"
    />
    <v-select
      v-model="form.qualityProfileId"
      :items="profileItems"
      :label="t('media.films.detail.edit_quality')"
      :loading="config === undefined"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-3"
    />
    <FolderPathField
      v-model="form.path"
      :label="t('media.films.detail.edit_path')"
      :load="loadFolders"
      :fallback-path="movie.path ?? '/'"
      :keys="FOLDER_KEYS"
      test-id="movie-edit"
      @update-path="(path) => emit('updatePath', path)"
    />
    <div class="text-body-medium mt-4 mb-2">{{ t('media.films.detail.edit_tags') }}</div>
    <div class="d-flex flex-wrap ga-1 mb-2">
      <v-chip
        v-for="tag in allTags"
        :key="tag.id"
        size="small"
        :variant="form.tags.includes(tag.id) ? 'flat' : 'outlined'"
        :color="form.tags.includes(tag.id) ? 'service' : undefined"
        :aria-pressed="form.tags.includes(tag.id)"
        @click="toggleTag(tag.id)"
        >{{ tag.label }}</v-chip
      >
    </div>
    <v-text-field
      v-model="newTag"
      :placeholder="t('media.films.detail.edit_tag_placeholder')"
      density="compact"
      variant="outlined"
      hide-details
      :loading="addingTag"
      @keydown.enter.prevent="addTag"
    >
      <template #append-inner>
        <v-btn
          :icon="msAdd"
          size="small"
          variant="text"
          :aria-label="t('common.action.add')"
          @click="addTag"
        />
      </template>
    </v-text-field>

    <div class="d-flex flex-wrap align-center ga-2 mt-4">
      <v-btn
        color="error"
        variant="tonal"
        size="small"
        data-test="movie-edit-delete"
        @click="emit('delete')"
        >{{ t('media.films.detail.edit_delete') }}</v-btn
      >
      <v-spacer />
      <v-btn variant="text" size="small" @click="(reset(), emit('cancel'))">{{
        t('media.films.detail.edit_cancel')
      }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        size="small"
        :loading="saving"
        data-test="movie-edit-save"
        @click="save"
        >{{ t('media.films.detail.edit_save') }}</v-btn
      >
    </div>
  </div>
</template>

<style scoped>
.movie-edit {
  max-width: 560px;
}
</style>
