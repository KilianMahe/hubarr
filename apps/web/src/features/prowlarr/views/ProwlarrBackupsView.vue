<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Sauvegardes de Prowlarr (`prowlarr/backups.html.twig`, n° 281) : création
// suivie jusqu'à la fin (n° 284) puis liste relue, suppression confirmée
// (n° 285). Pas de lien de téléchargement (adresse de Prowlarr, D103).
import { arrCommandStartedSchema, backupSchema, type Backup } from '@hubarr/shared';
import { mdiDelete, mdiPlus } from '@mdi/js';
import { ref } from 'vue';
import { z } from 'zod';
import { api } from '../../../app/api/client';
import { apiErrorText } from '../../../app/api/error-text';
import { useFormat } from '../../../app/format';
import { fillLegacy } from '../../../app/legacy-template';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import { useConfirmAction } from '../../arr-admin/admin-api';
import { useArrCommand } from '../../movies/useArrCommand';
import ProwlarrPage from '../ProwlarrPage.vue';
import { PROWLARR_API, prowlarrApi, useProwlarrPage } from '../prowlarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const format = useFormat();
const { query, feedback, error, run, t } = useProwlarrPage('/backups', z.array(backupSchema));
const confirm = useConfirmAction();
const commands = useArrCommand({ statusOf: (_slug, id) => prowlarrApi.commandStatus(id) });
const creating = ref(false);

async function create(): Promise<void> {
  creating.value = true;
  feedback.value = { type: 'info', text: t('prowlarr.backups.create_starting') };
  try {
    const started = await api.post(
      `${PROWLARR_API}/sauvegardes/creer`,
      {},
      arrCommandStartedSchema,
    );
    if (started.cmdId !== null) {
      feedback.value = { type: 'info', text: t('prowlarr.backups.create_in_progress') };
      const result = await commands.follow('', started.cmdId, () => undefined);
      if (result.outcome === 'stopped') return;
      if (result.outcome === 'failed') {
        feedback.value = { type: 'error', text: t('prowlarr.backups.create_error') };
        return;
      }
    }
    feedback.value = { type: 'success', text: t('prowlarr.backups.create_done') };
    await query.refetch();
  } catch (failure) {
    feedback.value = {
      type: 'error',
      text: apiErrorText(failure, t, 'prowlarr.backups.create_error'),
    };
  } finally {
    creating.value = false;
  }
}

function askDelete(backup: Backup): void {
  confirm.ask(fillLegacy(t('prowlarr.backups.confirm_delete_tpl'), { NAME: backup.name }), () =>
    run(
      () => api.post(`${PROWLARR_API}/sauvegardes/${backup.id}/supprimer`, {}),
      'prowlarr.backups.delete_error',
    ),
  );
}
const typeLabel = (type: string | null) =>
  type === 'scheduled'
    ? t('prowlarr.backups.type_scheduled')
    : type === 'manual'
      ? t('prowlarr.backups.type_manual')
      : (type ?? '—');
</script>

<template>
  <ProwlarrPage
    v-model:feedback="feedback"
    :title="t('prowlarr.backups.title')"
    :loading="query.isPending.value"
    :error="error"
  >
    <template #actions>
      <v-btn
        color="service"
        size="small"
        :prepend-icon="mdiPlus"
        :loading="creating"
        data-test="backup-create"
        @click="create"
        >{{ t('prowlarr.backups.create_btn') }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-card-title class="d-flex align-center ga-2 text-title-medium">
        {{ t('prowlarr.backups.card_title') }}
        <v-chip size="x-small" variant="tonal">{{
          t('prowlarr.backups.count_tpl', { count: query.data.value?.length ?? 0 })
        }}</v-chip>
      </v-card-title>
      <EmptyState
        v-if="(query.data.value ?? []).length === 0"
        inline
        :title="t('prowlarr.backups.empty')"
      />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th>{{ t('prowlarr.backups.col_name') }}</th>
            <th>{{ t('prowlarr.backups.col_type') }}</th>
            <th>{{ t('prowlarr.backups.col_size') }}</th>
            <th>{{ t('prowlarr.backups.col_date') }}</th>
            <th class="text-end">{{ t('prowlarr.backups.col_actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="backup in query.data.value" :key="backup.id" data-test="backup-row">
            <td class="font-weight-medium">{{ backup.name }}</td>
            <td>
              <v-chip size="x-small" variant="tonal">{{ typeLabel(backup.type) }}</v-chip>
            </td>
            <td class="text-muted">{{ backup.size === null ? '—' : format.bytes(backup.size) }}</td>
            <td class="text-muted text-no-wrap">
              {{ backup.time ? format.dateTime(backup.time) : '—' }}
            </td>
            <td class="text-end">
              <v-btn
                :icon="mdiDelete"
                size="small"
                variant="text"
                color="error"
                :aria-label="t('prowlarr.common.delete')"
                data-test="backup-delete"
                @click="askDelete(backup)"
              />
            </td>
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
  </ProwlarrPage>
</template>
