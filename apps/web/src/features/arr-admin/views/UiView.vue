<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Interface de l'instance (`radarr/ui.html.twig`) : dates et heures, style,
// langues (interface ; infos des films pour Radarr), enregistrées ensemble.
import { arrConfigSchema, uiPageSchema } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AdminPage from '../AdminPage.vue';
import ConfigForm from '../ConfigForm.vue';
import { useAdminPage } from '../admin-api';
import { UI_SECTIONS, configPatch, formValues, sectionsFor } from '../config-forms';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage('ui', '/ui', uiPageSchema);
const sections = computed(() => sectionsFor(UI_SECTIONS, ctx.kind.value));
const fields = computed(() => sections.value.flatMap((section) => section.fields));
const values = ref<Record<string, unknown>>({});
watch(
  () => query.data.value?.config,
  (config) => (values.value = formValues(config, fields.value)),
  { immediate: true },
);

const saving = ref(false);
async function save(): Promise<void> {
  saving.value = true;
  await run(
    () => ctx.post('/ui/sauvegarder', configPatch(values.value, fields.value), arrConfigSchema),
    ctx.key('error_save'),
    t(ctx.key('saved')),
  );
  saving.value = false;
}
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
    <template #actions>
      <v-btn color="service" size="small" :loading="saving" data-test="config-save" @click="save">{{
        t(ctx.key('save'))
      }}</v-btn>
    </template>
    <ConfigForm
      v-model="values"
      :sections="sections"
      :kind="ctx.kind.value"
      :languages="query.data.value?.languages ?? []"
    />
  </AdminPage>
</template>
