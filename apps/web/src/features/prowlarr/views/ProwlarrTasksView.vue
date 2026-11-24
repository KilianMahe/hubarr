<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Tâches planifiées de Prowlarr (`prowlarr/tasks.html.twig`, n° 280) :
// intervalle, dernière exécution et durée, prochaine ; lancement (n° 283).
import { arrCommandStartedSchema, systemTaskSchema, type SystemTask } from '@hubarr/shared';
import { msPlayArrowFill } from '../../../components/symbols';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { api } from '../../../app/api/client';
import { useFormat } from '../../../app/format';
import { fillLegacy } from '../../../app/legacy-template';
import { formatInterval } from '../../arr-admin/admin-format';
import ProwlarrPage from '../ProwlarrPage.vue';
import { PROWLARR_API, useProwlarrPage } from '../prowlarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const { locale } = useI18n();
const format = useFormat();
const { query, feedback, error, run, t } = useProwlarrPage('/tasks', z.array(systemTaskSchema));
const running = ref<number | null>(null);

async function launch(task: SystemTask): Promise<void> {
  running.value = task.id;
  await run(
    () =>
      api.post(`${PROWLARR_API}/taches/executer`, { name: task.taskName }, arrCommandStartedSchema),
    'prowlarr.tasks.feedback_run_error',
    fillLegacy(t('prowlarr.tasks.feedback_launched_tpl'), { NAME: task.name }),
  );
  running.value = null;
}
</script>

<template>
  <ProwlarrPage
    v-model:feedback="feedback"
    :title="t('prowlarr.tasks.title')"
    :count="query.data.value?.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <v-card variant="flat" border>
      <v-card-title class="text-title-medium">{{ t('prowlarr.tasks.card_title') }}</v-card-title>
      <EmptyState
        v-if="(query.data.value ?? []).length === 0"
        inline
        :title="t('prowlarr.tasks.empty')"
      />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th>{{ t('prowlarr.tasks.col_name') }}</th>
            <th>{{ t('prowlarr.tasks.col_interval') }}</th>
            <th>{{ t('prowlarr.tasks.col_last') }}</th>
            <th>{{ t('prowlarr.tasks.col_duration') }}</th>
            <th>{{ t('prowlarr.tasks.col_next') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in query.data.value" :key="task.id" data-test="task-row">
            <td class="font-weight-medium">{{ task.name }}</td>
            <td class="text-muted">{{ formatInterval(task.interval, locale) }}</td>
            <td class="text-muted text-no-wrap">
              {{
                task.lastExecution
                  ? format.dateTime(task.lastExecution)
                  : t('prowlarr.tasks.last_never')
              }}
            </td>
            <td class="text-muted">{{ task.lastDuration ?? '—' }}</td>
            <td class="text-muted text-no-wrap">
              {{ task.nextExecution ? format.dateTime(task.nextExecution) : '—' }}
            </td>
            <td class="text-end">
              <v-btn
                :icon="msPlayArrowFill"
                size="small"
                variant="text"
                :loading="running === task.id"
                :disabled="task.taskName === ''"
                :aria-label="t('prowlarr.tasks.run_title')"
                :title="t('prowlarr.tasks.run_title')"
                data-test="task-run"
                @click="launch(task)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </ProwlarrPage>
</template>
