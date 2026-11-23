<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Dialogue d'ajout ou de modification d'une ressource à schéma (port de
// `radarr/_schema_modal.html.twig`) : type (modèles de l'instance, ajout
// seulement), nom obligatoire, options de la famille, déclencheurs
// (notifications), étiquettes, champs dynamiques (`SchemaForm`), test et
// enregistrement. Une ressource modifiée sert de modèle à ses propres champs.
import {
  providerListSchema,
  providerSchema,
  providerTestResponseSchema,
  type Provider,
} from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdminDialog from './AdminDialog.vue';
import SchemaForm from './SchemaForm.vue';
import type { AdminContext } from './admin-api';
import {
  optionValues,
  presentOptions,
  providerPayload,
  triggerKeys,
  triggerLabelKey,
  type ProviderFamily,
  type ProviderForm,
} from './providers';
import { initialValues, templateLabel } from './schema-form';

const props = defineProps<{
  ctx: AdminContext;
  family: ProviderFamily;
  /** Ressource modifiée, `null` pour un ajout. */
  item: Provider | null;
  tagItems: { value: number; title: string }[];
  qualityProfiles: { value: number; title: string }[];
  rootFolders: { value: string; title: string }[];
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [] }>();
const { t } = useI18n();
const key = (suffix: string) => `media.arr_admin.${props.family.prefix}.${suffix}`;

const templates = useQuery({
  queryKey: computed(() => props.ctx.queryKey(props.family.prefix, 'schema')),
  queryFn: ({ signal }) =>
    props.ctx.get(`/${props.family.segment}/schema`, providerListSchema, signal),
  enabled: computed(() => open.value && props.item === null),
  staleTime: 5 * 60_000,
  retry: false,
});
const templateItems = computed(() =>
  (templates.data.value ?? []).map((template, index) => ({
    value: index,
    title: templateLabel(template),
  })),
);

const templateIndex = ref<number | null>(null);
const template = computed<Provider | null>(() => {
  if (props.item) return props.item;
  return templateIndex.value === null
    ? null
    : (templates.data.value?.[templateIndex.value] ?? null);
});
const options = computed(() =>
  template.value ? presentOptions(props.family.id, template.value) : [],
);
const triggers = computed(() =>
  props.family.id === 'notifications' && template.value ? triggerKeys(template.value) : [],
);

const form = reactive<ProviderForm>({ name: '', values: {}, tags: [], options: {}, triggers: {} });
const error = ref<string | null>(null);
const testResult = ref<{ ok: boolean; text: string } | null>(null);
const saving = ref(false);
const testing = ref(false);

function reset(base: Provider | null): void {
  form.values = base ? initialValues(base, props.item) : {};
  form.options = base ? optionValues(presentOptions(props.family.id, base), base) : {};
  form.triggers = Object.fromEntries(
    (props.family.id === 'notifications' && base ? triggerKeys(base) : []).map((name) => [
      name,
      props.item ? props.item[name] === true : false,
    ]),
  );
}

watch(open, (value) => {
  if (!value) return;
  error.value = null;
  testResult.value = null;
  templateIndex.value = null;
  form.name = props.item?.name ?? '';
  form.tags = [...(props.item?.tags ?? [])];
  reset(props.item);
});

function selectTemplate(index: number | null): void {
  templateIndex.value = index;
  const chosen = index === null ? null : (templates.data.value?.[index] ?? null);
  if (chosen && form.name.trim() === '') form.name = templateLabel(chosen);
  reset(chosen);
}

const noTemplates = computed(
  () =>
    props.item === null && templates.isSuccess.value && (templates.data.value ?? []).length === 0,
);

function payload() {
  const base = template.value;
  if (base === null) return null;
  if (form.name.trim() === '') {
    error.value = t('media.arr_admin.schema_modal.error_name_required');
    return null;
  }
  return providerPayload(props.item ?? base, base, form, props.item);
}

async function save(): Promise<void> {
  const body = payload();
  if (body === null) return;
  saving.value = true;
  error.value = null;
  try {
    const id = props.item?.id;
    const path =
      id === undefined
        ? `/${props.family.segment}/ajouter`
        : `/${props.family.segment}/${id}/modifier`;
    await props.ctx.post(path, body, providerSchema);
    open.value = false;
    emit('saved');
  } catch (failure) {
    error.value = props.ctx.errorMessage(failure, 'media.arr_admin.schema_modal.error_save');
  } finally {
    saving.value = false;
  }
}

async function test(): Promise<void> {
  const body = payload();
  if (body === null || props.family.testRoute === null) return;
  testing.value = true;
  testResult.value = null;
  try {
    const result = await props.ctx.post(
      `/${props.family.segment}/${props.family.testRoute}`,
      { ...body, ...(props.item?.id === undefined ? {} : { id: props.item.id }) },
      providerTestResponseSchema,
    );
    testResult.value = result.ok
      ? { ok: true, text: t('media.arr_admin.schema_modal.test_success') }
      : { ok: false, text: result.message ?? t('media.arr_admin.schema_modal.test_failure') };
  } catch (failure) {
    testResult.value = {
      ok: false,
      text: props.ctx.errorMessage(failure, 'media.arr_admin.schema_modal.error_network_test'),
    };
  } finally {
    testing.value = false;
  }
}

function triggerLabel(name: string): string {
  const labelKey = triggerLabelKey(name);
  return labelKey === null ? name : t(labelKey);
}
</script>

<template>
  <AdminDialog
    v-model="open"
    :title="t(key(item ? family.labels.titleEdit : family.labels.titleAdd))"
    :error="error"
    :saving="saving"
    :save-label="t('media.arr_admin.schema_modal.save')"
    :max-width="760"
    @save="save"
  >
    <template v-if="family.testRoute !== null && template" #extra>
      <v-btn
        variant="tonal"
        color="service-text"
        :loading="testing"
        data-test="provider-test"
        @click="test"
        >{{ t('media.arr_admin.schema_modal.test') }}</v-btn
      >
    </template>
    <v-alert
      v-if="testResult"
      :type="testResult.ok ? 'success' : 'error'"
      variant="tonal"
      density="compact"
      class="mb-4"
      data-test="provider-test-result"
      >{{ testResult.text }}</v-alert
    >
    <v-alert v-if="noTemplates" type="warning" variant="tonal" density="compact" class="mb-4">{{
      t(`media.arr_admin.schema_modal.error_schema_none_${ctx.kind.value}`)
    }}</v-alert>
    <v-alert
      v-if="templates.isError.value"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-4"
      >{{ t('media.arr_admin.schema_modal.error_schema_generic') }}</v-alert
    >
    <v-select
      v-if="item === null"
      :model-value="templateIndex"
      :items="templateItems"
      :loading="templates.isFetching.value"
      :label="t('media.arr_admin.schema_modal.type')"
      :placeholder="t('media.arr_admin.schema_modal.type_placeholder')"
      variant="outlined"
      density="compact"
      data-test="provider-type"
      @update:model-value="selectTemplate"
    />
    <template v-if="template">
      <v-text-field
        v-model="form.name"
        :label="`${t('media.arr_admin.schema_modal.name_label')} *`"
        :placeholder="t('media.arr_admin.schema_modal.name_placeholder')"
        variant="outlined"
        density="compact"
        data-test="provider-name"
      />
      <div v-if="options.length > 0" class="d-flex flex-wrap align-center ga-4 mb-4">
        <template v-for="option in options" :key="option.key">
          <v-checkbox
            v-if="option.type === 'bool'"
            v-model="form.options[option.key]"
            :label="t(option.labelKey)"
            color="service"
            density="compact"
            hide-details
            :data-test="`provider-option-${option.key}`"
          />
          <v-text-field
            v-else-if="option.type === 'number'"
            :model-value="form.options[option.key]"
            :label="t(option.labelKey)"
            type="number"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 140px"
            @update:model-value="form.options[option.key] = Number($event) || 0"
          />
          <v-select
            v-else-if="option.type === 'qualityProfile'"
            v-model="form.options[option.key]"
            :items="qualityProfiles"
            :label="t(option.labelKey)"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 220px"
          />
          <v-select
            v-else
            v-model="form.options[option.key]"
            :items="rootFolders"
            :label="t(option.labelKey)"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 220px"
          />
        </template>
      </div>
      <template v-if="triggers.length > 0">
        <h3 class="text-title-small mb-1">
          {{ t('media.arr_admin.schema_modal.triggers_label') }}
        </h3>
        <div class="provider-triggers mb-4">
          <v-checkbox
            v-for="name in triggers"
            :key="name"
            :model-value="form.triggers[name] === true"
            :label="triggerLabel(name)"
            color="service"
            density="compact"
            hide-details
            :data-test="`provider-trigger-${name}`"
            @update:model-value="form.triggers[name] = $event === true"
          />
        </div>
      </template>
      <v-select
        v-if="'tags' in template"
        v-model="form.tags"
        :items="tagItems"
        :label="t('media.arr_admin.tags.page_title')"
        multiple
        chips
        closable-chips
        variant="outlined"
        density="compact"
      />
      <SchemaForm v-model="form.values" :fields="template.fields ?? []" test-prefix="provider" />
    </template>
  </AdminDialog>
</template>

<style scoped>
.provider-triggers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
</style>
