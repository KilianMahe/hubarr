<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout ou modification d'un indexeur Prowlarr (`modal-add-indexer`,
// `modal-edit-indexer` de `prowlarr/index.html.twig`). Ajout : catalogue des
// définitions filtrable, puis fiche ; modification : fiche de l'indexeur de
// l'instance. Fiche : nom, profil d'application, priorité, activé,
// redirection, étiquettes (création à la volée), champs du schéma ; test et
// enregistrement.
import type { Provider } from '@hubarr/shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { mdiArrowLeft, mdiPlus } from '@mdi/js';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorText } from '../../app/api/error-text';
import { fillLegacy } from '../../app/legacy-template';
import AdminDialog from '../arr-admin/AdminDialog.vue';
import SchemaForm from '../arr-admin/SchemaForm.vue';
import {
  EMPTY_CATALOG_FILTERS,
  catalogOptions,
  definitionLabel,
  filterCatalog,
  indexerPayload,
  initialIndexerForm,
  visibleFields,
  withBaseUrlOptions,
  type CatalogFilters,
  type IndexerForm,
} from './indexers';
import { prowlarrApi, prowlarrKeys } from './prowlarr-api';

const props = defineProps<{
  /** Indexeur modifié, `null` pour un ajout. */
  indexerId: number | null;
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [message: string] }>();
const { t } = useI18n();
const queryClient = useQueryClient();

const adding = computed(() => props.indexerId === null);

const definitions = useQuery({
  queryKey: prowlarrKeys.schema,
  queryFn: ({ signal }) => prowlarrApi.indexerSchema(signal),
  enabled: computed(() => open.value && adding.value),
  staleTime: 10 * 60_000,
  retry: false,
});
const current = useQuery({
  queryKey: computed(() => prowlarrKeys.indexer(props.indexerId ?? 0)),
  queryFn: ({ signal }) => prowlarrApi.indexer(props.indexerId ?? 0, signal),
  enabled: computed(() => open.value && !adding.value),
  staleTime: 0,
  retry: false,
});
const profiles = useQuery({
  queryKey: prowlarrKeys.appProfiles,
  queryFn: ({ signal }) => prowlarrApi.appProfiles(signal),
  enabled: open,
  staleTime: 60_000,
  retry: false,
});
const tags = useQuery({
  queryKey: prowlarrKeys.tags,
  queryFn: ({ signal }) => prowlarrApi.tags(signal),
  enabled: open,
  staleTime: 60_000,
  retry: false,
});

// ── Catalogue ────────────────────────────────────────────────────────────────

const filters = reactive<CatalogFilters>({ ...EMPTY_CATALOG_FILTERS });
const options = computed(() => catalogOptions(definitions.data.value ?? []));
const catalog = computed(() => filterCatalog(definitions.data.value ?? [], filters));
const protocolItems = [
  { value: 'torrent', title: 'Torrent' },
  { value: 'usenet', title: 'Usenet' },
];
const privacyItems = computed(() => [
  { value: 'public', title: t('prowlarr.index.privacy_public') },
  { value: 'semiPrivate', title: t('prowlarr.index.privacy_semiprivate') },
  { value: 'private', title: t('prowlarr.index.privacy_private') },
]);
const countItems = (list: { value: string; count: number }[]) =>
  list.map((option) => ({ value: option.value, title: `${option.value} (${option.count})` }));

// ── Fiche ────────────────────────────────────────────────────────────────────

/** Indexeur (ou modèle) dont la fiche est ouverte. */
const base = ref<Provider | null>(null);
const form = reactive<IndexerForm>({
  name: '',
  appProfileId: null,
  priority: 25,
  enable: true,
  redirect: false,
  tags: [],
  values: {},
});
const error = ref<string | null>(null);
const testResult = ref<{ ok: boolean; text: string } | null>(null);
const saving = ref(false);
const testing = ref(false);
const newTag = ref('');
const creatingTag = ref(false);

const profileIds = computed(() => (profiles.data.value ?? []).map((profile) => profile.id));
const profileItems = computed(() =>
  (profiles.data.value ?? []).map((profile) => ({ value: profile.id, title: profile.name })),
);
const tagItems = computed(() =>
  (tags.data.value ?? []).map((tag) => ({ value: tag.id, title: tag.label })),
);
const fields = computed(() => (base.value ? visibleFields(base.value) : []));
const title = computed(() => {
  if (adding.value) {
    return base.value ? definitionLabel(base.value) : t('prowlarr.index.modal_add_title');
  }
  return fillLegacy(t('prowlarr.schema_modal.edit_title_tpl'), {
    NAME: current.data.value?.name ?? '—',
  });
});

function openForm(source: Provider, isTemplate: boolean): void {
  const prepared = withBaseUrlOptions(source, isTemplate);
  base.value = prepared;
  Object.assign(form, initialIndexerForm(prepared, profileIds.value));
  error.value = null;
  testResult.value = null;
}

watch(open, (value) => {
  if (!value) return;
  base.value = null;
  error.value = null;
  testResult.value = null;
  newTag.value = '';
  Object.assign(filters, EMPTY_CATALOG_FILTERS);
  if (!adding.value && current.data.value) openForm(current.data.value, false);
});
// Indexeur arrivé après l'ouverture ; une relecture ne remplace pas la saisie en cours.
watch(
  () => current.data.value,
  (indexer) => {
    if (!open.value || adding.value || !indexer) return;
    if (base.value === null || base.value.id !== indexer.id) openForm(indexer, false);
  },
);
// Profils chargés après l'ouverture de la fiche : profil par défaut appliqué.
watch(profileIds, (ids) => {
  if (base.value && form.appProfileId === null && ids.length > 0)
    form.appProfileId = ids[0] ?? null;
});

function back(): void {
  base.value = null;
  error.value = null;
  testResult.value = null;
}

async function createTag(): Promise<void> {
  const label = newTag.value.trim();
  if (label === '') return;
  creatingTag.value = true;
  try {
    const tag = await prowlarrApi.createTag(label);
    queryClient.setQueryData(prowlarrKeys.tags, (list: { id: number; label: string }[] = []) =>
      list.some((item) => item.id === tag.id) ? list : [...list, tag],
    );
    if (!form.tags.includes(tag.id)) form.tags = [...form.tags, tag.id];
    newTag.value = '';
  } catch (failure) {
    error.value = apiErrorText(failure, t, 'prowlarr.common.error');
  } finally {
    creatingTag.value = false;
  }
}

function payload() {
  if (base.value === null) return null;
  if (form.name.trim() === '') {
    error.value = t('media.arr_admin.schema_modal.error_name_required');
    return null;
  }
  return indexerPayload(base.value, form);
}

async function test(): Promise<void> {
  const body = payload();
  if (body === null) return;
  testing.value = true;
  testResult.value = null;
  try {
    const result = await prowlarrApi.testIndexer(body);
    testResult.value = result.ok
      ? { ok: true, text: t('prowlarr.common.test_success') }
      : {
          ok: false,
          text: fillLegacy(t('prowlarr.common.test_failure_tpl'), {
            ERROR: result.message ?? '—',
          }),
        };
  } catch (failure) {
    testResult.value = {
      ok: false,
      text: fillLegacy(t('prowlarr.common.test_failure_tpl'), {
        ERROR: apiErrorText(failure, t, 'prowlarr.common.error'),
      }),
    };
  } finally {
    testing.value = false;
  }
}

async function save(): Promise<void> {
  const body = payload();
  if (body === null) return;
  saving.value = true;
  error.value = null;
  try {
    if (props.indexerId === null) {
      await prowlarrApi.addIndexer(body);
      emit('saved', t('prowlarr.index.indexer_added'));
    } else {
      await prowlarrApi.updateIndexer(props.indexerId, body);
      emit('saved', t('prowlarr.common.saved'));
    }
    open.value = false;
  } catch (failure) {
    error.value = fillLegacy(t('prowlarr.common.error_tpl'), {
      ERROR: apiErrorText(
        failure,
        t,
        adding.value ? 'prowlarr.index.error_add_failed' : 'prowlarr.index.error_save_failed',
      ),
    });
  } finally {
    saving.value = false;
  }
}

const loading = computed(() =>
  adding.value ? definitions.isPending.value : current.isPending.value || base.value === null,
);
const loadFailed = computed(() =>
  adding.value ? definitions.isError.value : current.isError.value,
);
</script>

<template>
  <AdminDialog
    v-model="open"
    :title="title"
    :error="error"
    :saving="saving"
    :save-label="t(adding ? 'prowlarr.common.add' : 'prowlarr.common.save')"
    :hide-save="base === null"
    :max-width="880"
    @save="save"
  >
    <template v-if="base" #extra>
      <v-btn
        v-if="adding"
        variant="text"
        :prepend-icon="mdiArrowLeft"
        data-test="indexer-back"
        @click="back"
        >{{ t('prowlarr.common.back') }}</v-btn
      >
      <v-btn
        variant="tonal"
        color="service-text"
        :loading="testing"
        data-test="indexer-test"
        @click="test"
        >{{ t('prowlarr.common.test') }}</v-btn
      >
    </template>

    <v-alert v-if="loadFailed" type="error" variant="tonal" density="compact" class="mb-4">{{
      t('prowlarr.common.error_unreachable')
    }}</v-alert>
    <v-progress-linear
      v-else-if="loading && base === null && !adding"
      indeterminate
      color="service"
    />

    <!-- Catalogue des définitions -->
    <template v-if="adding && base === null && !loadFailed">
      <v-filter-field
        v-model="filters.q"
        :placeholder="t('prowlarr.index.modal_search_placeholder')"
        variant="outlined"
        density="compact"
        clearable
        autofocus
        hide-details
        class="mb-3"
        data-test="indexer-catalog-search"
        @click:clear="filters.q = ''"
      />
      <div class="indexer-catalog__filters mb-3">
        <v-filter-select
          v-model="filters.protocol"
          :items="protocolItems"
          :label="t('prowlarr.index.filter_protocol')"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          @click:clear="filters.protocol = ''"
        />
        <v-filter-select
          v-model="filters.privacy"
          :items="privacyItems"
          :label="t('prowlarr.index.filter_privacy')"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          @click:clear="filters.privacy = ''"
        />
        <v-filter-select
          v-model="filters.language"
          :items="countItems(options.languages)"
          :label="t('prowlarr.index.filter_lang')"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          @click:clear="filters.language = ''"
        />
        <v-filter-select
          v-model="filters.category"
          :items="countItems(options.categories)"
          :label="t('prowlarr.index.filter_category')"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          @click:clear="filters.category = ''"
        />
      </div>
      <v-progress-linear v-if="definitions.isPending.value" indeterminate color="service" />
      <p
        v-else-if="catalog.length === 0"
        class="text-center text-muted py-4"
        data-test="indexer-catalog-empty"
      >
        {{ t('prowlarr.common.no_results') }}
      </p>
      <div v-else class="indexer-catalog__grid">
        <v-card
          v-for="(definition, index) in catalog"
          :key="`${definition.definitionName ?? definition.name}-${index}`"
          variant="outlined"
          class="indexer-catalog__card"
          data-test="indexer-definition"
          @click="openForm(definition, true)"
        >
          <v-card-text>
            <div class="font-weight-medium mb-1">{{ definitionLabel(definition) }}</div>
            <div class="d-flex flex-wrap ga-1 mb-2">
              <v-chip
                size="x-small"
                label
                :color="definition.protocol === 'usenet' ? 'info' : 'primary'"
                variant="tonal"
                >{{ definition.protocol === 'usenet' ? 'Usenet' : 'Torrent' }}</v-chip
              >
              <v-chip
                size="x-small"
                label
                variant="tonal"
                :color="
                  definition.privacy === 'private'
                    ? 'error'
                    : definition.privacy === 'semiPrivate'
                      ? 'warning'
                      : 'success'
                "
                >{{
                  t(
                    definition.privacy === 'private'
                      ? 'prowlarr.index.privacy_private'
                      : definition.privacy === 'semiPrivate'
                        ? 'prowlarr.index.privacy_semi'
                        : 'prowlarr.index.privacy_public',
                  )
                }}</v-chip
              >
              <v-chip v-if="definition.language" size="x-small" label variant="tonal">{{
                definition.language
              }}</v-chip>
            </div>
            <p
              v-if="typeof definition.description === 'string'"
              class="text-body-small text-muted indexer-catalog__description"
            >
              {{ definition.description }}
            </p>
          </v-card-text>
        </v-card>
      </div>
    </template>

    <!-- Fiche de l'indexeur -->
    <template v-if="base">
      <v-alert
        v-if="testResult"
        :type="testResult.ok ? 'success' : 'error'"
        variant="tonal"
        density="compact"
        class="mb-4"
        data-test="indexer-test-result"
        >{{ testResult.text }}</v-alert
      >
      <div class="indexer-form__top mb-2">
        <v-text-field
          v-model="form.name"
          :label="`${t('prowlarr.common.name')} *`"
          variant="outlined"
          density="compact"
          data-test="indexer-name"
        />
        <v-select
          v-model="form.appProfileId"
          :items="profileItems"
          :loading="profiles.isPending.value"
          :label="t('prowlarr.index.field_app_profile')"
          variant="outlined"
          density="compact"
          data-test="indexer-app-profile"
        />
        <v-text-field
          :model-value="form.priority"
          :label="t('prowlarr.index.field_priority')"
          type="number"
          min="1"
          max="50"
          variant="outlined"
          density="compact"
          data-test="indexer-priority"
          @update:model-value="form.priority = Number($event) || 25"
        />
        <div class="d-flex flex-wrap ga-4">
          <v-switch
            v-model="form.enable"
            :label="t('prowlarr.common.enabled')"
            color="service"
            density="compact"
            hide-details
            data-test="indexer-enable"
          />
          <v-switch
            v-if="base.supportsRedirect !== false"
            v-model="form.redirect"
            :label="t('prowlarr.index.field_redirect')"
            color="service"
            density="compact"
            hide-details
            data-test="indexer-redirect"
          />
        </div>
      </div>
      <div class="d-flex flex-wrap align-start ga-2 mb-2">
        <v-select
          v-model="form.tags"
          :items="tagItems"
          :label="t('prowlarr.index.field_tags')"
          multiple
          chips
          closable-chips
          variant="outlined"
          density="compact"
          class="flex-grow-1"
          style="min-width: 220px"
          data-test="indexer-tags"
        />
        <v-text-field
          v-model="newTag"
          :placeholder="t('prowlarr.index.field_new_tag')"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 200px"
          data-test="indexer-new-tag"
          @keydown.enter.prevent="createTag"
        >
          <template #append-inner>
            <v-btn
              :icon="mdiPlus"
              size="x-small"
              variant="text"
              :loading="creatingTag"
              :aria-label="t('prowlarr.index.field_create_tag_title')"
              :title="t('prowlarr.index.field_create_tag_title')"
              data-test="indexer-create-tag"
              @click="createTag"
            />
          </template>
        </v-text-field>
      </div>
      <v-divider class="mb-4" />
      <SchemaForm v-model="form.values" :fields="fields" test-prefix="indexer" />
    </template>
  </AdminDialog>
</template>

<style scoped>
.indexer-catalog__filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
}
.indexer-catalog__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  max-height: 55vh;
  overflow-y: auto;
}
.indexer-catalog__card:hover {
  border-color: rgb(var(--v-theme-service));
}
.indexer-catalog__description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.indexer-form__top {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0 12px;
}
</style>
