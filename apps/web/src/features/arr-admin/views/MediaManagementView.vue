<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Gestion des médias (`radarr/media_management.html.twig`) : nommage (formats,
// remplacement des deux-points, exemples) et gestion des fichiers (dossiers,
// liens physiques, extras, propers, date des fichiers, corbeille,
// permissions), enregistrés séparément. Les exemples suivent les formats
// saisis, avant enregistrement.
import {
  arrConfigSchema,
  mediaManagementPageSchema,
  namingExamplesSchema,
  type NamingExamples,
} from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdminPage from '../AdminPage.vue';
import ConfigForm from '../ConfigForm.vue';
import { useAdminPage } from '../admin-api';
import {
  MEDIA_MANAGEMENT_FIELDS,
  NAMING_EXAMPLES,
  NAMING_FIELDS,
  configPatch,
  fieldsFor,
  formValues,
} from '../config-forms';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'media_management',
  '/gestion-medias',
  mediaManagementPageSchema,
);
const namingFields = computed(() => fieldsFor(NAMING_FIELDS, ctx.kind.value));
const mmFields = computed(() => fieldsFor(MEDIA_MANAGEMENT_FIELDS, ctx.kind.value));
const namingSections = computed(() => [
  { id: 'naming', titleKey: ctx.kindKey('naming.title'), fields: namingFields.value },
]);
const mmSections = computed(() => [
  { id: 'mm', titleKey: ctx.key('mm.title'), fields: mmFields.value },
]);
const naming = ref<Record<string, unknown>>({});
const management = ref<Record<string, unknown>>({});
watch(
  () => query.data.value,
  (data) => {
    naming.value = formValues(data?.naming, namingFields.value);
    management.value = formValues(data?.mediaManagement, mmFields.value);
  },
  { immediate: true },
);

const savingNaming = ref(false);
async function saveNaming(): Promise<void> {
  savingNaming.value = true;
  await run(
    () =>
      ctx.post(
        '/gestion-medias/naming',
        configPatch(naming.value, namingFields.value),
        arrConfigSchema,
      ),
    ctx.key('error_unknown'),
    t(ctx.key('naming_saved')),
  );
  savingNaming.value = false;
}

const savingMm = ref(false);
async function saveMm(): Promise<void> {
  savingMm.value = true;
  await run(
    () =>
      ctx.post(
        '/gestion-medias/mediamanagement',
        configPatch(management.value, mmFields.value),
        arrConfigSchema,
      ),
    ctx.key('error_unknown'),
    t(ctx.key('mm_saved')),
  );
  savingMm.value = false;
}

const examples = ref<NamingExamples | null>(null);
const previewing = ref(false);
async function preview(): Promise<void> {
  previewing.value = true;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    ...query.data.value?.naming,
    ...configPatch(naming.value, namingFields.value),
  })) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      params.set(key, String(value));
  }
  try {
    examples.value = await ctx.get(
      `/gestion-medias/naming/examples?${params.toString()}`,
      namingExamplesSchema,
    );
  } catch (failure) {
    feedback.value = { type: 'error', text: ctx.errorMessage(failure, ctx.key('error_network')) };
  } finally {
    previewing.value = false;
  }
}
const exampleRows = computed(() =>
  NAMING_EXAMPLES[ctx.kind.value].map((row) => ({
    ...row,
    value: examples.value?.[row.key] ?? null,
  })),
);
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :loading="query.isPending.value"
    :error="error"
  >
    <ConfigForm v-model="naming" :sections="namingSections" :kind="ctx.kind.value" wide>
      <template #after-naming>
        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-btn
            variant="tonal"
            color="service-text"
            size="small"
            :loading="previewing"
            data-test="naming-preview"
            @click="preview"
            >{{ t(ctx.key('naming.preview')) }}</v-btn
          >
          <v-spacer />
          <v-btn
            color="service"
            size="small"
            :loading="savingNaming"
            data-test="naming-save"
            @click="saveNaming"
            >{{ t(ctx.key('naming.save')) }}</v-btn
          >
        </div>
        <v-table v-if="examples" density="compact" data-test="naming-examples">
          <tbody>
            <tr v-for="row in exampleRows" :key="row.key">
              <td class="text-muted">{{ t(row.labelKey) }}</td>
              <td class="font-monospace text-body-small">
                {{ row.value ?? t(ctx.key('naming.preview_empty')) }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </template>
    </ConfigForm>
    <ConfigForm
      v-model="management"
      :sections="mmSections"
      :kind="ctx.kind.value"
      wide
      class="mt-2"
    >
      <template #after-mm>
        <div class="d-flex">
          <v-spacer />
          <v-btn
            color="service"
            size="small"
            :loading="savingMm"
            data-test="mm-save"
            @click="saveMm"
            >{{ t(ctx.kindKey('mm.save')) }}</v-btn
          >
        </div>
      </template>
    </ConfigForm>
  </AdminPage>
</template>
