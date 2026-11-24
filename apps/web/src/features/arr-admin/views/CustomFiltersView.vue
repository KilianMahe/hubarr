<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Filtres personnalisés de l'interface de l'instance
// (`radarr/custom_filters.html.twig`) : nom, type (écran de l'instance),
// conditions en JSON ; ajout, modification, suppression confirmée. Écart : les
// types proposés sont ceux des écrans de l'instance (l'original proposait
// `movie` et `customFilter`, inconnus d'elle) ; un type libre reste possible.
import { customFilterSchema, type CustomFilter } from '@hubarr/shared';
import { msAdd, msDelete, msEdit } from '../../../components/symbols';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';
import { CUSTOM_FILTER_TYPES, parseFilterConditions } from '../admin-format';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'custom_filters',
  '/filtres-personnalises',
  z.array(customFilterSchema),
);
const confirm = useConfirmAction();
const types = computed(() => CUSTOM_FILTER_TYPES[ctx.kind.value]);

const open = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const editing = ref<CustomFilter | null>(null);
const form = reactive({ label: '', type: '', conditions: '[]' });
function edit(filter: CustomFilter | null): void {
  editing.value = filter;
  formError.value = null;
  Object.assign(form, {
    label: filter?.label ?? '',
    type: filter?.type ?? types.value[0],
    conditions: JSON.stringify(filter?.filters ?? [], null, 2),
  });
  open.value = true;
}
async function save(): Promise<void> {
  if (form.label.trim() === '') {
    formError.value = t(ctx.key('err_name_required'));
    return;
  }
  const filters = parseFilterConditions(form.conditions);
  if (filters === null) {
    formError.value = t(ctx.key('err_invalid_json'));
    return;
  }
  saving.value = true;
  formError.value = null;
  const body = {
    ...(editing.value ?? {}),
    label: form.label.trim(),
    type: form.type.trim(),
    filters,
  };
  try {
    const id = editing.value?.id;
    if (id === undefined)
      await ctx.post('/filtres-personnalises/ajouter', body, customFilterSchema);
    else await ctx.post(`/filtres-personnalises/${id}/modifier`, body, customFilterSchema);
    open.value = false;
    await query.refetch();
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.key('err_save'));
  } finally {
    saving.value = false;
  }
}
function askDelete(filter: CustomFilter): void {
  if (filter.id === undefined) return;
  const id = filter.id;
  confirm.ask(t(ctx.key('delete_confirm_tpl'), { label: filter.label ?? '' }), () =>
    run(() => ctx.post(`/filtres-personnalises/${id}/supprimer`), ctx.key('delete_error')),
  );
}
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
        data-test="filter-add"
        @click="edit(null)"
        >{{ t(ctx.key('btn_add')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_name')) }}</th>
            <th>{{ t(ctx.key('col_type')) }}</th>
            <th>{{ t(ctx.key('col_filters')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="filter in query.data.value" :key="filter.id" data-test="filter-row">
            <td class="font-weight-medium">{{ filter.label }}</td>
            <td>
              <v-chip size="x-small" label variant="tonal">{{ filter.type }}</v-chip>
            </td>
            <td>
              <v-chip
                v-for="(condition, index) in filter.filters ?? []"
                :key="index"
                size="x-small"
                class="me-1 mb-1"
                >{{ condition.key }} {{ condition.type }}</v-chip
              >
            </td>
            <td class="text-end text-no-wrap">
              <v-btn
                :icon="msEdit"
                variant="text"
                size="small"
                :aria-label="t(ctx.key('btn_edit_title'))"
                :title="t(ctx.key('btn_edit_title'))"
                data-test="filter-edit"
                @click="edit(filter)"
              />
              <v-btn
                :icon="msDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('btn_delete_title'))"
                :title="t(ctx.key('btn_delete_title'))"
                data-test="filter-delete"
                @click="askDelete(filter)"
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
      :title="t(ctx.key(editing ? 'modal_title_edit' : 'modal_title_add'))"
      :error="formError"
      :saving="saving"
      :save-label="t(ctx.key('save'))"
      @save="save"
    >
      <v-text-field
        v-model="form.label"
        :label="t(ctx.key('label'))"
        :placeholder="t(ctx.key('label_placeholder'))"
        variant="outlined"
        density="compact"
        data-test="filter-label"
      />
      <v-combobox
        v-model="form.type"
        :items="types"
        :label="t(ctx.key('type'))"
        variant="outlined"
        density="compact"
      />
      <v-textarea
        v-model="form.conditions"
        :label="t(ctx.key('conditions_label'))"
        :hint="t(ctx.key('conditions_help'))"
        persistent-hint
        rows="6"
        auto-grow
        class="font-monospace"
        variant="outlined"
        density="compact"
        data-test="filter-conditions"
      />
    </AdminDialog>
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </AdminPage>
</template>
