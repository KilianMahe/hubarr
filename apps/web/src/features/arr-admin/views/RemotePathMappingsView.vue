<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Chemins distants (`radarr/remote_path_mappings.html.twig`) : hôte, chemin
// distant, chemin local ; ajout, modification, suppression confirmée.
import { remotePathMappingSchema, type RemotePathMapping } from '@hubarr/shared';
import { mdiDelete, mdiPencil, mdiPlus } from '@mdi/js';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'remote_path_mappings',
  '/chemins-distants',
  z.array(remotePathMappingSchema),
);
const confirm = useConfirmAction();

const open = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const editing = ref<RemotePathMapping | null>(null);
const form = reactive({ host: '', remotePath: '', localPath: '' });
function edit(mapping: RemotePathMapping | null): void {
  editing.value = mapping;
  formError.value = null;
  Object.assign(form, {
    host: mapping?.host ?? '',
    remotePath: mapping?.remotePath ?? '',
    localPath: mapping?.localPath ?? '',
  });
  open.value = true;
}
async function save(): Promise<void> {
  const body = {
    host: form.host.trim(),
    remotePath: form.remotePath.trim(),
    localPath: form.localPath.trim(),
  };
  if (body.host === '' || body.remotePath === '' || body.localPath === '') {
    formError.value = t(ctx.key('error_required_fields'));
    return;
  }
  saving.value = true;
  formError.value = null;
  try {
    const id = editing.value?.id;
    if (id === undefined)
      await ctx.post('/chemins-distants/ajouter', body, remotePathMappingSchema);
    else await ctx.post(`/chemins-distants/${id}/modifier`, body, remotePathMappingSchema);
    open.value = false;
    await query.refetch();
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.key('error_save'));
  } finally {
    saving.value = false;
  }
}
function askDelete(mapping: RemotePathMapping): void {
  confirm.ask(t(ctx.key('confirm_delete_tpl'), { host: mapping.host }), () =>
    run(() => ctx.post(`/chemins-distants/${mapping.id}/supprimer`), ctx.key('error_delete')),
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
        :prepend-icon="mdiPlus"
        data-test="mapping-add"
        @click="edit(null)"
        >{{ t(ctx.key('add')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_host')) }}</th>
            <th>{{ t(ctx.key('col_remote_path')) }}</th>
            <th>{{ t(ctx.key('col_local_path')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="mapping in query.data.value" :key="mapping.id" data-test="mapping-row">
            <td class="font-weight-medium">{{ mapping.host }}</td>
            <td class="font-monospace text-body-small">{{ mapping.remotePath }}</td>
            <td class="font-monospace text-body-small">{{ mapping.localPath }}</td>
            <td class="text-end text-no-wrap">
              <v-btn
                :icon="mdiPencil"
                variant="text"
                size="small"
                :aria-label="t(ctx.key('edit'))"
                :title="t(ctx.key('edit'))"
                data-test="mapping-edit"
                @click="edit(mapping)"
              />
              <v-btn
                :icon="mdiDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('delete'))"
                :title="t(ctx.key('delete'))"
                data-test="mapping-delete"
                @click="askDelete(mapping)"
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
      :max-width="560"
      @save="save"
    >
      <v-text-field
        v-model="form.host"
        :label="t(ctx.key('host_label'))"
        :placeholder="t(ctx.key('host_placeholder'))"
        variant="outlined"
        density="compact"
        data-test="mapping-host"
      />
      <v-text-field
        v-model="form.remotePath"
        :label="t(ctx.key('remote_path_label'))"
        :placeholder="t(ctx.key('remote_path_placeholder'))"
        variant="outlined"
        density="compact"
        data-test="mapping-remote"
      />
      <v-text-field
        v-model="form.localPath"
        :label="t(ctx.key('local_path_label'))"
        :placeholder="t(ctx.key('local_path_placeholder'))"
        variant="outlined"
        density="compact"
        data-test="mapping-local"
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
