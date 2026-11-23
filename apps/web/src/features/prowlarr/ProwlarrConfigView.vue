<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section de configuration de Prowlarr (« Général » n° 276-277, « Interface »
// n° 278-279) : formulaire déclaratif enregistré d'un bloc, mots de passe
// vides inchangés et confirmés côté front ; champs du proxy masqués tant
// qu'il est désactivé.
import { arrConfigSchema } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { api } from '../../app/api/client';
import ConfigForm from '../arr-admin/ConfigForm.vue';
import { configPatch, formValues, type ConfigSection } from '../arr-admin/config-forms';
import ProwlarrPage from './ProwlarrPage.vue';
import { PROWLARR_API, useProwlarrPage } from './prowlarr-api';
import { PROXY_KEYS } from './config-sections';

const props = defineProps<{
  path: '/general' | '/ui';
  sections: ConfigSection[];
  prefix: string;
}>();
const { query, feedback, error, run, t } = useProwlarrPage(props.path, arrConfigSchema);
const values = ref<Record<string, unknown>>({});
const allFields = computed(() => props.sections.flatMap((section) => section.fields));
watch(
  () => query.data.value,
  (config) => (values.value = formValues(config, allFields.value)),
  { immediate: true },
);
const shown = computed(() =>
  props.sections.map((section) => ({
    ...section,
    fields: section.fields.filter(
      (field) => !PROXY_KEYS.has(field.key) || values.value.proxyEnabled === true,
    ),
  })),
);

const saving = ref(false);
async function save(): Promise<void> {
  const patch = configPatch(values.value, allFields.value);
  if ((patch.password ?? '') !== (patch.passwordConfirmation ?? '')) {
    feedback.value = { type: 'error', text: t('setup.error.password_mismatch') };
    return;
  }
  saving.value = true;
  await run(
    () => api.post(`${PROWLARR_API}${props.path}/save`, patch, arrConfigSchema),
    `${props.prefix}.save_error`,
    t(`${props.prefix}.saved`),
  );
  saving.value = false;
}
</script>

<template>
  <ProwlarrPage
    v-model:feedback="feedback"
    :title="t(`${prefix}.title`)"
    :loading="query.isPending.value"
    :error="error"
  >
    <template #actions>
      <v-btn color="service" size="small" :loading="saving" data-test="config-save" @click="save">{{
        t(`${prefix}.save_btn`)
      }}</v-btn>
    </template>
    <ConfigForm v-model="values" :sections="shown" />
  </ProwlarrPage>
</template>
