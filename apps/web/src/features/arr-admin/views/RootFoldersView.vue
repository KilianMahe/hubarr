<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Dossiers racine (`radarr/root_folders.html.twig`) : chemin (inaccessible
// signalé), espace libre et total, ajout, suppression confirmée. Écart : la
// colonne « Films » de l'original comptait les dossiers non associés sous un
// libellé trompeur ; elle n'est pas reprise.
import { rootFolderSchema, type RootFolder } from '@hubarr/shared';
import { mdiAlertCircle, mdiDelete, mdiPlus } from '@mdi/js';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { useFormat } from '../../../app/format';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';

const { t } = useI18n();
const format = useFormat();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'root_folders',
  '/dossiers-racine',
  z.array(rootFolderSchema),
);
const confirm = useConfirmAction();

const open = ref(false);
const path = ref('');
const saving = ref(false);
const formError = ref<string | null>(null);
function openAdd(): void {
  path.value = '';
  formError.value = null;
  open.value = true;
}
async function add(): Promise<void> {
  if (path.value.trim() === '') {
    formError.value = t(ctx.key('error_path_required'));
    return;
  }
  saving.value = true;
  formError.value = null;
  try {
    await ctx.post('/dossiers-racine/ajouter', { path: path.value.trim() }, rootFolderSchema);
    open.value = false;
    await query.refetch();
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.kindKey('error_add'));
  } finally {
    saving.value = false;
  }
}

function askDelete(folder: RootFolder): void {
  confirm.ask(t(ctx.key('confirm_delete_tpl'), { path: folder.path }), () =>
    run(() => ctx.post(`/dossiers-racine/${folder.id}/supprimer`), ctx.key('error_delete')),
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
        data-test="root-folder-add"
        @click="openAdd"
        >{{ t(ctx.key('add')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_path')) }}</th>
            <th>{{ t(ctx.key('col_free')) }}</th>
            <th>{{ t(ctx.key('col_total')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="folder in query.data.value" :key="folder.id" data-test="root-folder-row">
            <td class="font-monospace text-body-small">
              <v-icon
                v-if="!folder.accessible"
                :icon="mdiAlertCircle"
                color="error"
                size="small"
                class="me-1"
              />{{ folder.path }}
            </td>
            <td class="text-muted">
              {{ folder.freeSpace === null ? '—' : format.bytes(folder.freeSpace) }}
            </td>
            <td class="text-muted">
              {{ folder.totalSpace === null ? '—' : format.bytes(folder.totalSpace) }}
            </td>
            <td class="text-end">
              <v-btn
                :icon="mdiDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('delete'))"
                :title="t(ctx.key('delete'))"
                data-test="root-folder-delete"
                @click="askDelete(folder)"
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
      :title="t(ctx.key('modal_title'))"
      :error="formError"
      :saving="saving"
      :save-label="t(ctx.key('add_btn'))"
      :max-width="520"
      @save="add"
    >
      <v-text-field
        v-model="path"
        :label="t(ctx.key('path_label'))"
        :placeholder="t(ctx.key('path_placeholder'))"
        :hint="t(ctx.kindKey('path_hint'))"
        persistent-hint
        variant="outlined"
        density="compact"
        autofocus
        data-test="root-folder-path"
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
