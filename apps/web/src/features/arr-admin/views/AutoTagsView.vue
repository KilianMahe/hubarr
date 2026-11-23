<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Auto-tags (`radarr/auto_tags.html.twig`) : règles (nom, étiquettes
// appliquées, retrait si la règle ne correspond plus, conditions), ajout,
// modification, suppression confirmée. Écarts : les étiquettes
// se choisissent par leur nom et les conditions s'éditent avec les modèles de
// l'instance (`/autotagging/schema`), comme celles des formats, au lieu d'ids
// et d'un JSON brut.
import { autoTagSchema, autoTagsPageSchema, type AutoTag } from '@hubarr/shared';
import { mdiDelete, mdiPencil, mdiPlus } from '@mdi/js';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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
  'auto_tags',
  '/auto-tags',
  autoTagsPageSchema,
);
const confirm = useConfirmAction();
const page = computed(() => query.data.value);
const tagItems = computed(() =>
  (page.value?.tags ?? []).map((tag) => ({ value: tag.id, title: tag.label })),
);
const tagLabel = (id: number) => page.value?.tags.find((tag) => tag.id === id)?.label ?? `#${id}`;

const open = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const editing = ref<AutoTag | null>(null);
const name = ref('');
const tags = ref<number[]>([]);
const removeUnmatched = ref(false);
const drafts = ref<SpecificationDraft[]>([]);

function edit(rule: AutoTag | null): void {
  editing.value = rule;
  formError.value = null;
  name.value = rule?.name ?? '';
  tags.value = [...(rule?.tags ?? [])];
  removeUnmatched.value = rule?.removeTagsAutomatically ?? false;
  drafts.value = specificationDrafts(rule?.specifications ?? [], page.value?.schema ?? []);
  open.value = true;
}

async function save(): Promise<void> {
  if (name.value.trim() === '') {
    formError.value = t(ctx.key('err_name_required'));
    return;
  }
  saving.value = true;
  formError.value = null;
  const payload = {
    ...(editing.value ?? {}),
    name: name.value.trim(),
    tags: tags.value,
    removeTagsAutomatically: removeUnmatched.value,
    specifications: specificationsPayload(drafts.value, page.value?.schema ?? []),
  };
  try {
    const id = editing.value?.id;
    if (id === undefined) await ctx.post('/auto-tags/ajouter', payload, autoTagSchema);
    else await ctx.post(`/auto-tags/${id}/modifier`, payload, autoTagSchema);
    open.value = false;
    await query.refetch();
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.key('err_save'));
  } finally {
    saving.value = false;
  }
}

function askDelete(rule: AutoTag): void {
  if (rule.id === undefined) return;
  const id = rule.id;
  confirm.ask(t(ctx.key('delete_confirm_tpl'), { name: rule.name ?? '' }), () =>
    run(() => ctx.post(`/auto-tags/${id}/supprimer`), ctx.key('delete_error')),
  );
}

const labels = computed(() => ({
  title: t(ctx.key('specifications_title')),
  add: t(ctx.key('btn_add_spec')),
  empty: t(ctx.key('no_specs')),
  condition: (n: number) => t(ctx.key('condition_n_tpl'), { n }),
  type: t(ctx.key('type_label')),
  typePlaceholder: t(ctx.key('type_placeholder')),
  name: t(ctx.key('name_label')),
  namePlaceholder: t(ctx.key('name_placeholder')),
  negate: t(ctx.key('negate_label')),
  required: t(ctx.key('required_label')),
}));
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="page?.rules.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <template #actions>
      <v-btn
        variant="text"
        size="small"
        :to="{ name: `${ctx.kind.value}-tags`, params: { slug: ctx.slug.value } }"
        >{{ t(ctx.key('btn_tags')) }}</v-btn
      >
      <v-btn
        color="service"
        size="small"
        :prepend-icon="mdiPlus"
        data-test="autotag-add"
        @click="edit(null)"
        >{{ t(ctx.key('btn_add')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-card-title class="text-title-medium">{{ t(ctx.key('rules_card_title')) }}</v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_name')) }}</th>
            <th>{{ t(ctx.key('col_conditions')) }}</th>
            <th>{{ t(ctx.key('col_tags_applied')) }}</th>
            <th>{{ t(ctx.key('col_remove_unmatched')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in page?.rules ?? []" :key="rule.id" data-test="autotag-row">
            <td class="font-weight-medium">{{ rule.name }}</td>
            <td>
              {{
                t(ctx.key('conditions_count_tpl'), { count: (rule.specifications ?? []).length })
              }}
            </td>
            <td>
              <v-chip v-for="tag in rule.tags ?? []" :key="tag" size="x-small" class="me-1">{{
                tagLabel(tag)
              }}</v-chip>
            </td>
            <td>{{ t(ctx.key(rule.removeTagsAutomatically ? 'yes' : 'no')) }}</td>
            <td class="text-end text-no-wrap">
              <v-btn
                :icon="mdiPencil"
                variant="text"
                size="small"
                :aria-label="t(ctx.key('btn_edit_title'))"
                :title="t(ctx.key('btn_edit_title'))"
                data-test="autotag-edit"
                @click="edit(rule)"
              />
              <v-btn
                :icon="mdiDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('btn_delete_title'))"
                :title="t(ctx.key('btn_delete_title'))"
                data-test="autotag-delete"
                @click="askDelete(rule)"
              />
            </td>
          </tr>
          <tr v-if="(page?.rules ?? []).length === 0">
            <td colspan="5" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <AdminDialog
      v-model="open"
      :title="
        editing
          ? t(ctx.key('modal_title_edit_tpl'), { name: editing.name ?? '' })
          : t(ctx.key('modal_title_new'))
      "
      :error="formError"
      :saving="saving"
      :save-label="t(ctx.key(editing ? 'btn_save' : 'btn_create'))"
      :max-width="820"
      @save="save"
    >
      <v-text-field
        v-model="name"
        :label="t(ctx.key('label_name'))"
        :placeholder="t(ctx.key('label_name_placeholder'))"
        variant="outlined"
        density="compact"
        data-test="autotag-name"
      />
      <v-select
        v-model="tags"
        :items="tagItems"
        :label="t(ctx.key('col_tags_applied'))"
        multiple
        chips
        closable-chips
        variant="outlined"
        density="compact"
        data-test="autotag-tags"
      />
      <v-checkbox
        v-model="removeUnmatched"
        :label="t(ctx.key('label_remove_unmatched'))"
        color="service"
        density="compact"
        hide-details
        class="mb-3"
      />
      <SpecificationsEditor v-model="drafts" :templates="page?.schema ?? []" :labels="labels" />
    </AdminDialog>
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </AdminPage>
</template>
