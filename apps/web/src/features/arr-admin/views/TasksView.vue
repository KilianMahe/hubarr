<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Tâches planifiées (`radarr/tasks.html.twig`) : nom, intervalle, dernière et
// prochaine exécution ; lancement d'une tâche (commande de même nom).
import { arrCommandStartedSchema, systemTaskSchema, type SystemTask } from '@hubarr/shared';
import { msPlayArrowFill } from '../../../components/symbols';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { useFormat } from '../../../app/format';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';
import { formatInterval } from '../admin-format';

const { t, locale } = useI18n();
const format = useFormat();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'tasks',
  '/taches',
  z.array(systemTaskSchema),
);

const running = ref<number | null>(null);
async function launch(task: SystemTask): Promise<void> {
  running.value = task.id;
  await run(
    () => ctx.post('/taches/executer', { commandName: task.taskName }, arrCommandStartedSchema),
    ctx.key('error_run'),
    t(ctx.key('launched_tpl'), { name: task.name }),
  );
  running.value = null;
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
      <v-card-title class="text-title-medium">{{ t(ctx.key('card_title')) }}</v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_name')) }}</th>
            <th>{{ t(ctx.key('col_interval')) }}</th>
            <th>{{ t(ctx.key('col_last')) }}</th>
            <th>{{ t(ctx.key('col_next')) }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in query.data.value" :key="task.id" data-test="task-row">
            <td class="font-weight-medium">{{ task.name }}</td>
            <td class="text-muted">{{ formatInterval(task.interval, locale) }}</td>
            <td class="text-muted text-no-wrap">
              {{ task.lastExecution === null ? '—' : (format.dateTime(task.lastExecution) ?? '—') }}
            </td>
            <td class="text-muted text-no-wrap">
              {{ task.nextExecution === null ? '—' : (format.dateTime(task.nextExecution) ?? '—') }}
            </td>
            <td class="text-end">
              <v-btn
                :icon="msPlayArrowFill"
                variant="text"
                size="small"
                color="service-text"
                :disabled="task.taskName === ''"
                :loading="running === task.id"
                :aria-label="t(ctx.key('run_title'))"
                :title="t(ctx.key('run_title'))"
                data-test="task-run"
                @click="launch(task)"
              />
            </td>
          </tr>
          <tr v-if="(query.data.value ?? []).length === 0">
            <td colspan="5" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </AdminPage>
</template>
