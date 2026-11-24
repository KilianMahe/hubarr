<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Sauvegardes de l'instance (`radarr/backups.html.twig`) : liste (nom, type,
// taille, date), création suivie jusqu'à la fin, restauration confirmée
// (l'instance redémarre), suppression confirmée. Écart : les sauvegardes ne se
// téléchargent pas (leur lien est une URL de l'instance).
import { arrCommandStartedSchema, backupSchema, type Backup } from '@hubarr/shared';
import { msAdd, msDelete, msSettingsBackupRestore } from '../../../components/symbols';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { useFormat } from '../../../app/format';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminCommand, useAdminPage, useConfirmAction } from '../admin-api';

const { t } = useI18n();
const format = useFormat();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'backups',
  '/sauvegardes',
  z.array(backupSchema),
);
const confirm = useConfirmAction();
const command = useAdminCommand(ctx);

const creating = ref(false);
async function create(): Promise<void> {
  creating.value = true;
  feedback.value = { type: 'info', text: t(ctx.key('backup_starting')) };
  try {
    const started = await ctx.post('/sauvegardes/creer', {}, arrCommandStartedSchema);
    if (started.cmdId !== null) {
      feedback.value = { type: 'info', text: t(ctx.key('backup_in_progress')) };
      const result = await command.follow(ctx.slug.value, started.cmdId, (tick) => {
        feedback.value = {
          type: 'info',
          text: t(ctx.key('backup_status_tpl'), { status: tick.status.status }),
        };
      });
      if (result.outcome === 'failed') {
        feedback.value = { type: 'error', text: t(ctx.key('backup_failed')) };
        return;
      }
    }
    feedback.value = { type: 'success', text: t(ctx.key('backup_created')) };
    await query.refetch();
  } catch (failure) {
    feedback.value = { type: 'error', text: ctx.errorMessage(failure, ctx.key('backup_error')) };
  } finally {
    creating.value = false;
  }
}

function askRestore(backup: Backup): void {
  confirm.ask(
    `${t(ctx.key('modal_question_prefix'))}${backup.name}${t(ctx.key('modal_question_suffix'))}\n${t(ctx.kindKey('restart_warning'))}`,
    async () => {
      try {
        await ctx.post(`/sauvegardes/${backup.id}/restaurer`);
        feedback.value = { type: 'success', text: t(ctx.kindKey('restore_started')) };
      } catch (failure) {
        feedback.value = {
          type: 'error',
          text: ctx.errorMessage(failure, ctx.key('restore_error')),
        };
      }
    },
  );
}

function askDelete(backup: Backup): void {
  confirm.ask(t(ctx.key('confirm_delete')), () =>
    run(() => ctx.post(`/sauvegardes/${backup.id}/supprimer`), ctx.key('error_delete')),
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
        :loading="creating"
        data-test="backup-create"
        @click="create"
        >{{ t(ctx.key('create')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_name')) }}</th>
            <th>{{ t(ctx.key('col_type')) }}</th>
            <th>{{ t(ctx.key('col_size')) }}</th>
            <th>{{ t(ctx.key('col_date')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="backup in query.data.value" :key="backup.id" data-test="backup-row">
            <td class="font-monospace text-body-small">{{ backup.name }}</td>
            <td>
              <v-chip
                size="x-small"
                variant="tonal"
                :color="backup.type === 'manual' ? 'info' : undefined"
                >{{
                  backup.type === 'manual'
                    ? t(ctx.key('type_manual'))
                    : backup.type === 'scheduled'
                      ? t(ctx.key('type_scheduled'))
                      : (backup.type ?? '—')
                }}</v-chip
              >
            </td>
            <td class="text-muted">{{ backup.size === null ? '—' : format.bytes(backup.size) }}</td>
            <td class="text-muted text-no-wrap">
              {{ backup.time === null ? '—' : (format.dateTime(backup.time) ?? '—') }}
            </td>
            <td class="text-end text-no-wrap">
              <v-btn
                :icon="msSettingsBackupRestore"
                variant="text"
                size="small"
                :aria-label="t(ctx.key('restore'))"
                :title="t(ctx.key('restore'))"
                data-test="backup-restore"
                @click="askRestore(backup)"
              />
              <v-btn
                :icon="msDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('delete'))"
                :title="t(ctx.key('delete'))"
                data-test="backup-delete"
                @click="askDelete(backup)"
              />
            </td>
          </tr>
          <tr v-if="(query.data.value ?? []).length === 0">
            <td colspan="5" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </AdminPage>
</template>
