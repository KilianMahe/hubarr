<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout ou modification d'une application, d'un client de téléchargement ou
// d'une notification Prowlarr (`pw-modal-add`, `pw-modal-edit` des pages à
// schéma) : catalogue des modèles avec recherche, puis fiche (nom, champs de
// la famille, étiquettes, champs du schéma), test et enregistrement.
import {
  arrTagItemSchema,
  providerListSchema,
  providerSchema,
  providerTestResponseSchema,
  type Provider,
} from '@hubarr/shared';
import { msArrowBack } from '../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { api } from '../../app/api/client';
import { apiErrorText } from '../../app/api/error-text';
import { fillLegacy } from '../../app/legacy-template';
import AdminDialog from '../arr-admin/AdminDialog.vue';
import SchemaForm from '../arr-admin/SchemaForm.vue';
import { PROWLARR_API, prowlarrKeys } from './prowlarr-api';
import {
  filterTemplates,
  initialProviderForm,
  presentTopFields,
  providerSavePayload,
  type ProviderFormState,
  type ProwlarrProviderFamily,
} from './providers';
import EmptyState from '../../components/EmptyState.vue';

const props = defineProps<{ family: ProwlarrProviderFamily; itemId: number | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [] }>();
const { t } = useI18n();
const url = (suffix: string) => `${PROWLARR_API}/${props.family.segment}${suffix}`;
const adding = computed(() => props.itemId === null);

const templates = useQuery({
  queryKey: computed(() => [...prowlarrKeys.all, props.family.segment, 'schema']),
  queryFn: ({ signal }) => api.get(url('/schema'), providerListSchema, signal),
  enabled: computed(() => open.value && adding.value),
  staleTime: 10 * 60_000,
  retry: false,
});
const current = useQuery({
  queryKey: computed(() => [...prowlarrKeys.all, props.family.segment, props.itemId ?? 0]),
  queryFn: ({ signal }) => api.get(url(`/${props.itemId ?? 0}`), providerSchema, signal),
  enabled: computed(() => open.value && !adding.value),
  staleTime: 0,
  retry: false,
});
const tags = useQuery({
  queryKey: prowlarrKeys.tags,
  queryFn: ({ signal }) => api.get(`${PROWLARR_API}/tags`, z.array(arrTagItemSchema), signal),
  enabled: open,
  staleTime: 60_000,
  retry: false,
});

const search = ref('');
const catalog = computed(() => filterTemplates(templates.data.value ?? [], search.value));
const base = ref<Provider | null>(null);
const form = reactive<ProviderFormState>({ name: '', top: {}, tags: [], values: {} });
const error = ref<string | null>(null);
const testResult = ref<{ ok: boolean; text: string } | null>(null);
const saving = ref(false);
const testing = ref(false);
const top = computed(() => (base.value ? presentTopFields(props.family, base.value) : []));
const tagItems = computed(() =>
  (tags.data.value ?? []).map((tag) => ({ value: tag.id, title: tag.label })),
);
const title = computed(() =>
  adding.value
    ? base.value
      ? (base.value.implementationName ?? base.value.name ?? '—')
      : t(`${props.family.prefix}.add_modal_title`)
    : fillLegacy(t('prowlarr.schema_modal.edit_title_tpl'), {
        NAME: current.data.value?.name ?? '—',
      }),
);

function select(source: Provider): void {
  base.value = source;
  Object.assign(form, initialProviderForm(props.family, source));
  error.value = null;
  testResult.value = null;
}

watch(open, (value) => {
  if (!value) return;
  base.value = null;
  search.value = '';
  error.value = null;
  testResult.value = null;
  if (!adding.value && current.data.value) select(current.data.value);
});
watch(
  () => current.data.value,
  (item) => {
    if (!open.value || adding.value || !item) return;
    if (base.value === null || base.value.id !== item.id) select(item);
  },
);

function payload() {
  if (base.value === null) return null;
  if (form.name.trim() === '') {
    error.value = t('media.arr_admin.schema_modal.error_name_required');
    return null;
  }
  return providerSavePayload(base.value, form);
}

async function test(): Promise<void> {
  const body = payload();
  if (body === null) return;
  testing.value = true;
  testResult.value = null;
  try {
    const result = await api.post(url('/test'), body, providerTestResponseSchema);
    testResult.value = result.ok
      ? { ok: true, text: t('prowlarr.common.test_success') }
      : {
          ok: false,
          text: fillLegacy(t('prowlarr.common.test_failure_tpl'), { ERROR: result.message ?? '—' }),
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
    await api.post(
      adding.value ? url('/add') : url(`/${props.itemId ?? 0}/update`),
      body,
      providerSchema,
    );
    open.value = false;
    emit('saved');
  } catch (failure) {
    error.value = fillLegacy(t('prowlarr.common.error_tpl'), {
      ERROR: apiErrorText(failure, t, 'prowlarr.common.error'),
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AdminDialog
    v-model="open"
    :title="title"
    :error="error"
    :saving="saving"
    :save-label="t(adding ? 'prowlarr.common.add' : 'prowlarr.common.save')"
    :hide-save="base === null"
    :max-width="820"
    @save="save"
  >
    <template v-if="base" #extra>
      <v-btn v-if="adding" variant="text" :prepend-icon="msArrowBack" @click="base = null">{{
        t('prowlarr.common.back')
      }}</v-btn>
      <v-btn
        variant="tonal"
        color="service-text"
        :loading="testing"
        data-test="provider-test"
        @click="test"
        >{{ t('prowlarr.common.test') }}</v-btn
      >
    </template>

    <v-alert
      v-if="templates.isError.value || current.isError.value"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-4"
      >{{ t('prowlarr.common.error_unreachable') }}</v-alert
    >

    <template v-if="adding && base === null">
      <v-filter-field
        v-model="search"
        :placeholder="
          family.id === 'notifications'
            ? t('prowlarr.notifications.search_placeholder')
            : t('prowlarr.common.search_placeholder')
        "
        variant="outlined"
        density="compact"
        hide-details
        autofocus
        class="mb-3"
        data-test="provider-catalog-search"
      />
      <v-progress-linear v-if="templates.isPending.value" indeterminate color="service" />
      <EmptyState
        v-else-if="catalog.length === 0"
        inline
        :title="t('prowlarr.common.no_results')"
      />
      <div v-else class="provider-catalog">
        <v-card
          v-for="(template, index) in catalog"
          :key="`${template.implementation}-${index}`"
          variant="outlined"
          data-test="provider-template"
          @click="select(template)"
        >
          <v-card-text class="d-flex align-center ga-2">
            <span class="font-weight-medium flex-grow-1">{{
              template.name || template.implementationName || '—'
            }}</span>
            <v-chip
              v-if="family.showProtocol"
              size="x-small"
              label
              variant="tonal"
              :color="template.protocol === 'usenet' ? 'info' : 'primary'"
              >{{ template.protocol === 'usenet' ? 'Usenet' : 'Torrent' }}</v-chip
            >
          </v-card-text>
        </v-card>
      </div>
    </template>

    <template v-if="base">
      <v-alert
        v-if="testResult"
        :type="testResult.ok ? 'success' : 'error'"
        variant="tonal"
        density="compact"
        class="mb-4"
        data-test="provider-test-result"
        >{{ testResult.text }}</v-alert
      >
      <v-text-field
        v-model="form.name"
        :label="`${t('prowlarr.common.name')} *`"
        variant="outlined"
        density="compact"
        data-test="provider-name"
      />
      <h3 v-if="family.id === 'notifications' && top.length > 0" class="text-title-small mb-1">
        {{ t('prowlarr.notifications.triggers_label') }}
      </h3>
      <div v-if="top.length > 0" class="provider-top mb-3">
        <template v-for="field in top" :key="field.key">
          <v-switch
            v-if="field.type === 'bool'"
            :model-value="form.top[field.key] === true"
            :label="t(field.labelKey)"
            color="service"
            density="compact"
            hide-details
            :data-test="`provider-top-${field.key}`"
            @update:model-value="form.top[field.key] = $event === true"
          />
          <v-text-field
            v-else-if="field.type === 'number'"
            :model-value="form.top[field.key]"
            :label="t(field.labelKey)"
            type="number"
            variant="outlined"
            density="compact"
            hide-details
            :data-test="`provider-top-${field.key}`"
            @update:model-value="form.top[field.key] = Number($event) || field.fallback"
          />
          <v-select
            v-else
            v-model="form.top[field.key]"
            :items="
              field.options.map((option) => ({ value: option.value, title: t(option.labelKey) }))
            "
            :label="t(field.labelKey)"
            variant="outlined"
            density="compact"
            hide-details
            :data-test="`provider-top-${field.key}`"
          />
        </template>
      </div>
      <v-select
        v-if="'tags' in base"
        v-model="form.tags"
        :items="tagItems"
        :label="t('prowlarr.index.field_tags')"
        multiple
        chips
        closable-chips
        variant="outlined"
        density="compact"
      />
      <v-divider class="mb-4" />
      <SchemaForm v-model="form.values" :fields="base.fields ?? []" test-prefix="provider" />
    </template>
  </AdminDialog>
</template>

<style scoped>
.provider-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 55vh;
  overflow-y: auto;
}
.provider-top {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px 12px;
}
</style>
