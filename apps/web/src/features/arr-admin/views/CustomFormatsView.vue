<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Formats personnalisés (`radarr/custom_formats.html.twig`) : liste avec ses
// conditions, ajout, modification (nom, « inclure dans le renommage »,
// conditions), suppression confirmée. Les modèles de conditions viennent de
// `GET …/formats/schema`, chargés à la première ouverture du dialogue.
import { customFormatSchema, specificationSchema, type CustomFormat } from '@hubarr/shared';
import { msAdd, msDelete, msEdit } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import SpecificationsEditor from '../SpecificationsEditor.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';
import {
  specificationDrafts,
  specificationsPayload,
  type SpecificationDraft,
} from '../specifications';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'custom_formats',
  '/formats',
  z.array(customFormatSchema),
);
const confirm = useConfirmAction();

const open = ref(false);
const templatesQuery = useQuery({
  queryKey: computed(() => ctx.queryKey('custom_formats', 'schema')),
  queryFn: ({ signal }) => ctx.get('/formats/schema', z.array(specificationSchema), signal),
  enabled: open,
  staleTime: 5 * 60_000,
  retry: false,
});
const templates = computed(() => templatesQuery.data.value ?? []);

const saving = ref(false);
const formError = ref<string | null>(null);
const editing = ref<CustomFormat | null>(null);
const name = ref('');
const includeRenaming = ref(false);
const drafts = ref<SpecificationDraft[]>([]);

async function edit(format: CustomFormat | null): Promise<void> {
  editing.value = format;
  formError.value = null;
  name.value = format?.name ?? '';
  includeRenaming.value = format?.includeCustomFormatWhenRenaming ?? false;
  drafts.value = [];
  open.value = true;
  const result = await templatesQuery.refetch();
  if (result.isError || (result.data ?? []).length === 0) {
    formError.value = t(ctx.kindKey('error_load_schema'));
  }
  drafts.value = specificationDrafts(format?.specifications ?? [], result.data ?? []);
}

async function save(): Promise<void> {
  if (name.value.trim() === '') {
    formError.value = t(ctx.key('error_name_required'));
    return;
  }
  saving.value = true;
  formError.value = null;
  const payload = {
    ...(editing.value ?? {}),
    name: name.value.trim(),
    includeCustomFormatWhenRenaming: includeRenaming.value,
    specifications: specificationsPayload(drafts.value, templates.value),
  };
  try {
    const id = editing.value?.id;
    if (id === undefined) await ctx.post('/formats/ajouter', payload, customFormatSchema);
    else await ctx.post(`/formats/${id}/modifier`, payload, customFormatSchema);
    open.value = false;
    await query.refetch();
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.key('error_save'));
  } finally {
    saving.value = false;
  }
}

function askDelete(format: CustomFormat): void {
  if (format.id === undefined) return;
  const id = format.id;
  confirm.ask(t(ctx.key('confirm_delete_tpl'), { name: format.name ?? '' }), () =>
    run(() => ctx.post(`/formats/${id}/supprimer`), ctx.key('error_delete')),
  );
}

const labels = computed(() => ({
  title: t(ctx.key('conditions_section')),
  add: t(ctx.key('add_condition')),
  empty: t(ctx.key('empty_conditions')),
  condition: (index: number) => t(ctx.key('condition_tpl'), { index }),
  type: t(ctx.key('condition_type')),
  typePlaceholder: t(ctx.key('condition_type_placeholder')),
  name: t(ctx.key('condition_name')),
  namePlaceholder: t(ctx.key('condition_name_placeholder')),
  negate: t(ctx.key('negate')),
  required: t(ctx.key('required')),
}));
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="query.data.value?.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <template #actions>
      <v-btn
        color="service"
        size="small"
        :prepend-icon="msAdd"
        data-test="format-add"
        @click="edit(null)"
        >{{ t(ctx.key('add')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_name')) }}</th>
            <th>{{ t(ctx.key('col_conditions')) }}</th>
            <th>{{ t(ctx.key('col_include_renaming')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="format in query.data.value" :key="format.id" data-test="format-row">
            <td class="font-weight-medium">{{ format.name }}</td>
            <td>
              <template v-if="(format.specifications ?? []).length > 0">
                <v-chip
                  v-for="(spec, index) in format.specifications"
                  :key="index"
                  size="x-small"
                  class="me-1 mb-1"
                  :color="spec.negate ? 'error' : undefined"
                  >{{ spec.negate ? '!' : '' }}{{ spec.name ?? spec.implementation ?? '?' }}</v-chip
                >
              </template>
              <span v-else class="text-muted">{{ t(ctx.key('none')) }}</span>
            </td>
            <td>{{ t(ctx.key(format.includeCustomFormatWhenRenaming ? 'yes' : 'no')) }}</td>
            <td class="text-end text-no-wrap">
              <v-btn
                :icon="msEdit"
                variant="text"
                size="small"
                :aria-label="t(ctx.key('edit'))"
                :title="t(ctx.key('edit'))"
                data-test="format-edit"
                @click="edit(format)"
              />
              <v-btn
                :icon="msDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('delete'))"
                :title="t(ctx.key('delete'))"
                data-test="format-delete"
                @click="askDelete(format)"
              />
            </td>
          </tr>
          <tr v-if="(query.data.value ?? []).length === 0">
            <td colspan="4" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <AdminDialog
      v-model="open"
      :title="
        editing
          ? t(ctx.key('modal_edit_tpl'), {
              name: editing.name ?? t(ctx.key('modal_edit_fallback')),
            })
          : t(ctx.key('modal_new'))
      "
      :error="formError"
      :saving="saving"
      :save-label="t(ctx.key(editing ? 'save' : 'create'))"
      :max-width="820"
      @save="save"
    >
      <v-text-field
        v-model="name"
        :label="t(ctx.key('name_label'))"
        :placeholder="t(ctx.key('name_placeholder'))"
        variant="outlined"
        density="compact"
        data-test="format-name"
      />
      <v-checkbox
        v-model="includeRenaming"
        :label="t(ctx.key('include_renaming'))"
        color="service"
        density="compact"
        hide-details
        class="mb-3"
      />
      <v-progress-linear
        v-if="templatesQuery.isFetching.value"
        indeterminate
        color="service"
        class="mb-2"
      />
      <SpecificationsEditor v-model="drafts" :templates="templates" :labels="labels" />
    </AdminDialog>
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </AdminPage>
</template>
