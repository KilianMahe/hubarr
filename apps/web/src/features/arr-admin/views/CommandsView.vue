<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Commandes de l'instance (`radarr/commands.html.twig`) : récentes en tête,
// relues toutes les 5 s (onglet visible), statut, début, fin, durée, message ;
// annulation confirmée d'une commande en attente ou en cours.
import { arrCommandSummarySchema, type ArrCommandSummary } from '@hubarr/shared';
import { mdiCancel } from '@mdi/js';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { useFormat } from '../../../app/format';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';

const { t } = useI18n();
const format = useFormat();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'commands',
  '/commandes',
  z.array(arrCommandSummarySchema),
  {
    refetchInterval: 5_000,
  },
);
const confirm = useConfirmAction();

const STATUS_COLORS: Record<string, string> = {
  queued: 'info',
  started: 'warning',
  completed: 'success',
  failed: 'error',
};
const statusLabel = (status: string) =>
  ['queued', 'started', 'completed', 'failed'].includes(status)
    ? t(ctx.key(`status_${status}`))
    : status;

function askCancel(command: ArrCommandSummary): void {
  confirm.ask(t(ctx.key('confirm_cancel_tpl'), { id: command.id }), () =>
    run(
      () => ctx.post(`/command/${command.id}/annuler`),
      ctx.key('error_cancel'),
      t(ctx.key('cancelled_tpl'), { id: command.id }),
    ),
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
    <v-card variant="flat" border>
      <v-card-title class="d-flex align-center text-title-medium">
        {{ t(ctx.key('card_title')) }}
        <v-spacer />
        <span class="text-body-small text-muted">{{ t(ctx.key('refresh_hint')) }}</span>
      </v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_id')) }}</th>
            <th>{{ t(ctx.key('col_command')) }}</th>
            <th>{{ t(ctx.key('col_status')) }}</th>
            <th>{{ t(ctx.key('col_started')) }}</th>
            <th>{{ t(ctx.key('col_ended')) }}</th>
            <th>{{ t(ctx.key('col_duration')) }}</th>
            <th>{{ t(ctx.key('col_message')) }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="command in query.data.value" :key="command.id" data-test="command-row">
            <td class="text-muted">{{ command.id }}</td>
            <td class="font-weight-medium">{{ command.name }}</td>
            <td>
              <v-chip size="x-small" variant="tonal" :color="STATUS_COLORS[command.status]">{{
                statusLabel(command.status)
              }}</v-chip>
            </td>
            <td class="text-muted text-no-wrap">
              {{ command.started === null ? '—' : (format.time(command.started) ?? '—') }}
            </td>
            <td class="text-muted text-no-wrap">
              {{ command.ended === null ? '—' : (format.time(command.ended) ?? '—') }}
            </td>
            <td class="text-muted">{{ command.duration ?? '—' }}</td>
            <td class="text-muted text-body-small commands-message" :title="command.message ?? ''">
              {{ command.message ?? '' }}
            </td>
            <td class="text-end">
              <v-btn
                v-if="command.status === 'queued' || command.status === 'started'"
                :icon="mdiCancel"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('cancel_title'))"
                :title="t(ctx.key('cancel_title'))"
                data-test="command-cancel"
                @click="askCancel(command)"
              />
            </td>
          </tr>
          <tr v-if="(query.data.value ?? []).length === 0">
            <td colspan="8" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
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

<style scoped>
.commands-message {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
