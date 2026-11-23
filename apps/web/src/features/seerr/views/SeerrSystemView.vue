<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Pages système de Seerr (`meta.seerrSection`) : à propos (n° 98), mises à
// jour (n° 99, notes de version GitHub par section), journaux (n° 100,
// niveau et page dans l'URL), tâches et cache (n° 101-106 : exécuter,
// annuler, planifier une tâche ; vider un cache ou tout le cache).
import { SEERR_RELEASE_SECTIONS } from '@hubarr/shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { apiErrorText } from '../../../app/api/error-text';
import { useFormat } from '../../../app/format';
import { useNotifyStore } from '../../../app/stores/notify';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import ResponsiveDialog from '../../../components/ResponsiveDialog.vue';
import SeerrPage from '../SeerrPage.vue';
import { field, seerrApi, text } from '../seerr-api';

type Row = Record<string, unknown>;
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const format = useFormat();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const section = computed(() => route.meta.seerrSection ?? 'about');
const logPage = computed(() => Math.max(1, Number(route.query.page ?? 1) || 1));
const logFilter = computed(() =>
  typeof route.query.filter === 'string' ? route.query.filter : '',
);

const about = useQuery({
  queryKey: ['seerr', 'about'],
  queryFn: ({ signal }) => seerrApi.about(signal),
  enabled: computed(() => section.value === 'about'),
  retry: false,
});
const updates = useQuery({
  queryKey: ['seerr', 'updates'],
  queryFn: ({ signal }) => seerrApi.updates(signal),
  enabled: computed(() => section.value === 'updates'),
  retry: false,
});
const logs = useQuery({
  queryKey: computed(() => ['seerr', 'logs', logPage.value, logFilter.value]),
  queryFn: ({ signal }) => seerrApi.logs(logPage.value, logFilter.value, signal),
  enabled: computed(() => section.value === 'logs'),
  retry: false,
});
const tasks = useQuery({
  queryKey: ['seerr', 'tasks'],
  queryFn: ({ signal }) => seerrApi.tasks(signal),
  enabled: computed(() => section.value === 'tasks'),
  retry: false,
});
const active = computed(() =>
  section.value === 'updates'
    ? updates
    : section.value === 'logs'
      ? logs
      : section.value === 'tasks'
        ? tasks
        : about,
);
const titleKey = computed(
  () => `jellyseerr.settings.${section.value === 'tasks' ? 'tasks_cache' : section.value}.title`,
);

async function run(
  task: () => Promise<unknown>,
  successKey = 'jellyseerr.common.saved',
): Promise<void> {
  try {
    await task();
    notify.success(successKey);
    await queryClient.invalidateQueries({ queryKey: ['seerr', 'tasks'] });
  } catch (error) {
    notify.error('common.labels.text', {
      text: apiErrorText(error, t, 'jellyseerr.common.error_action_failed'),
    });
  }
}
const scheduleJob = ref<Row | null>(null);
const scheduleValue = ref('');
const scheduleOpen = computed({
  get: () => scheduleJob.value !== null,
  set: (value: boolean) => {
    if (!value) scheduleJob.value = null;
  },
});
const flushOpen = ref(false);
const aboutRows = computed(() => {
  const a = about.data.value;
  if (!a) return [];
  return [
    ['version', field(a.about, 'version', field(a.status, 'version', '—'))],
    ['commit', field(a.status, 'commitTag', '—')],
    ['timezone', field(a.about, 'tz', '—')],
    ['data_path', field(a.about, 'appDataPath', '—')],
    ['stat_media', field(a.about, 'totalMediaItems', 0)],
    ['stat_requests', field(a.about, 'totalRequests', field(a.requestCounts, 'total', 0))],
    ['stat_users', a.totalUsers],
    ['stat_issues', field(a.issueCounts, 'total', 0)],
  ] as const;
});
const caches = computed(() => field<unknown[]>(tasks.data.value?.cache, 'apiCaches', []) as Row[]);
const levelColor = (level: unknown) =>
  level === 'error' ? 'error' : level === 'warn' ? 'warning' : level === 'debug' ? 'grey' : 'info';
</script>

<template>
  <SeerrPage :title="t(titleKey)" :loading="active.isPending.value" :error="active.isError.value">
    <v-card
      v-if="section === 'about' && about.data.value"
      variant="flat"
      border
      style="max-width: 720px"
      data-test="seerr-about"
    >
      <v-table density="compact">
        <tbody>
          <tr v-for="[key, value] in aboutRows" :key="key">
            <th>{{ t(`jellyseerr.settings.about.${key}`) }}</th>
            <td>{{ value }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <template v-if="section === 'updates' && updates.data.value">
      <p class="text-body-medium mb-3">
        {{ t('jellyseerr.settings.updates.installed_version') }} :
        <strong>{{ field(updates.data.value.status, 'version', '—') }}</strong>
      </p>
      <p v-if="updates.data.value.releases.length === 0" class="text-muted">
        {{ t('jellyseerr.settings.updates.cant_fetch_releases') }}
      </p>
      <v-expansion-panels v-else variant="accordion" data-test="seerr-releases">
        <v-expansion-panel v-for="release in updates.data.value.releases" :key="release.tag">
          <v-expansion-panel-title>
            <strong class="me-2">{{ release.version }}</strong>
            <span class="text-muted me-2">{{ release.date ? format.date(release.date) : '' }}</span>
            <v-chip v-if="release.current" size="x-small" label color="success">{{
              t('jellyseerr.settings.updates.installed_badge')
            }}</v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <template v-for="key in SEERR_RELEASE_SECTIONS" :key="key">
              <div v-if="release.sections[key]?.length" class="mb-2">
                <div class="text-title-small">
                  {{ t(`jellyseerr.settings.updates.changes_${key}`) }}
                </div>
                <ul class="ps-5 text-body-small">
                  <li v-for="(item, i) in release.sections[key]" :key="i">{{ item }}</li>
                </ul>
              </div>
            </template>
            <a v-if="release.url" :href="release.url" target="_blank" rel="noopener noreferrer">{{
              t('jellyseerr.settings.updates.view_on_github')
            }}</a>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>

    <template v-if="section === 'logs' && logs.data.value">
      <v-btn-toggle
        :model-value="logFilter"
        density="compact"
        variant="outlined"
        mandatory
        class="mb-3"
        @update:model-value="(v: string) => router.push({ query: { filter: v, page: '1' } })"
      >
        <v-btn value="">{{ t('jellyseerr.settings.logs.level_all') }}</v-btn>
        <v-btn v-for="level in ['debug', 'info', 'warn', 'error']" :key="level" :value="level">{{
          t(`jellyseerr.settings.logs.level_${level}`)
        }}</v-btn>
      </v-btn-toggle>
      <p v-if="logs.data.value.logs.length === 0" class="text-muted">
        {{ t('jellyseerr.settings.logs.none') }}
      </p>
      <v-table v-else density="compact" data-test="seerr-logs">
        <thead>
          <tr>
            <th>{{ t('jellyseerr.settings.logs.col_date') }}</th>
            <th>{{ t('jellyseerr.settings.logs.col_level') }}</th>
            <th>{{ t('jellyseerr.settings.logs.col_module') }}</th>
            <th>{{ t('jellyseerr.settings.logs.col_message') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(log, i) in logs.data.value.logs" :key="i">
            <td class="text-no-wrap">{{ format.dateTime(field(log, 'timestamp', '')) }}</td>
            <td>
              <v-chip size="x-small" label :color="levelColor(log.level)">{{
                text(log.level)
              }}</v-chip>
            </td>
            <td>{{ text(log.label) }}</td>
            <td class="text-body-small">{{ text(log.message) }}</td>
          </tr>
        </tbody>
      </v-table>
      <v-pagination
        v-if="logs.data.value.pageInfo.pages > 1"
        :model-value="logPage"
        :length="logs.data.value.pageInfo.pages"
        :total-visible="5"
        density="compact"
        class="mt-2"
        @update:model-value="
          (p: number) => router.push({ query: { ...route.query, page: String(p) } })
        "
      />
    </template>

    <template v-if="section === 'tasks' && tasks.data.value">
      <v-card variant="flat" border class="mb-4" data-test="seerr-jobs">
        <v-card-title class="text-title-small">{{
          t('jellyseerr.settings.tasks_cache.jobs_title')
        }}</v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ t('jellyseerr.settings.tasks_cache.col_task') }}</th>
              <th>{{ t('jellyseerr.settings.tasks_cache.col_next') }}</th>
              <th>{{ t('jellyseerr.settings.tasks_cache.col_status') }}</th>
              <th class="text-end">{{ t('jellyseerr.settings.tasks_cache.col_actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in tasks.data.value.jobs" :key="text(job.id)" data-test="seerr-job">
              <td>
                {{ text(job.name, job.id) }}
                <div class="text-caption text-muted">{{ text(job.cronSchedule) }}</div>
              </td>
              <td class="text-no-wrap">
                {{ job.nextExecutionTime ? format.dateTime(text(job.nextExecutionTime)) : '—' }}
              </td>
              <td>
                <v-chip size="x-small" label :color="job.running ? 'info' : undefined">{{
                  t(
                    job.running
                      ? 'jellyseerr.settings.tasks_cache.status_running'
                      : 'jellyseerr.settings.tasks_cache.status_idle',
                  )
                }}</v-chip>
              </td>
              <td class="text-end text-no-wrap">
                <v-btn
                  v-if="!job.running"
                  size="small"
                  variant="tonal"
                  data-test="seerr-job-run"
                  @click="run(() => seerrApi.job(text(job.id), 'run'))"
                  >{{ t('jellyseerr.settings.tasks_cache.action_run') }}</v-btn
                >
                <v-btn
                  v-else
                  size="small"
                  variant="tonal"
                  @click="run(() => seerrApi.job(text(job.id), 'cancel'))"
                  >{{ t('jellyseerr.settings.tasks_cache.action_cancel') }}</v-btn
                >
                <v-btn
                  size="small"
                  variant="text"
                  @click="
                    scheduleJob = job;
                    scheduleValue = text(job.cronSchedule);
                  "
                  >{{ t('jellyseerr.settings.tasks_cache.action_edit_schedule') }}</v-btn
                >
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
      <v-card variant="flat" border data-test="seerr-cache">
        <v-card-title class="d-flex align-center text-title-small">
          {{ t('jellyseerr.settings.tasks_cache.cache_title') }}
          <v-spacer />
          <v-btn size="small" variant="tonal" color="error" @click="flushOpen = true">{{
            t('jellyseerr.settings.tasks_cache.flush_all')
          }}</v-btn>
        </v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ t('jellyseerr.settings.tasks_cache.cache_col_service') }}</th>
              <th>{{ t('jellyseerr.settings.tasks_cache.cache_col_cached') }}</th>
              <th>{{ t('jellyseerr.settings.tasks_cache.cache_col_misses') }}</th>
              <th>{{ t('jellyseerr.settings.tasks_cache.cache_col_keys') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="cache in caches" :key="text(cache.id)">
              <td>{{ text(cache.name, cache.id) }}</td>
              <td>{{ field(field(cache, 'stats', {} as Row), 'hits', 0) }}</td>
              <td>{{ field(field(cache, 'stats', {} as Row), 'misses', 0) }}</td>
              <td>{{ field(field(cache, 'stats', {} as Row), 'keys', 0) }}</td>
              <td class="text-end">
                <v-btn
                  size="small"
                  variant="text"
                  @click="
                    run(
                      () => seerrApi.flushCache(text(cache.id)),
                      'jellyseerr.settings.tasks_cache.flush_done',
                    )
                  "
                  >{{ t('jellyseerr.settings.tasks_cache.cache_flush_one') }}</v-btn
                >
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <ResponsiveDialog
      v-model="scheduleOpen"
      :title="t('jellyseerr.settings.tasks_cache.modal_title')"
      :max-width="460"
    >
      <v-text-field
        v-model="scheduleValue"
        :label="t('jellyseerr.settings.tasks_cache.cron_custom_label')"
        :placeholder="t('jellyseerr.settings.tasks_cache.cron_custom_placeholder')"
        :hint="t('jellyseerr.settings.tasks_cache.cron_custom_help')"
        persistent-hint
        density="compact"
      />
      <template #actions>
        <v-btn variant="text" @click="scheduleJob = null">{{
          t('jellyseerr.settings.tasks_cache.modal_cancel')
        }}</v-btn>
        <v-btn
          color="service"
          variant="flat"
          @click="
            run(() => seerrApi.schedule(String(scheduleJob?.id ?? ''), scheduleValue));
            scheduleJob = null;
          "
          >{{ t('jellyseerr.settings.tasks_cache.modal_save') }}</v-btn
        >
      </template>
    </ResponsiveDialog>
    <ConfirmDialog
      v-model="flushOpen"
      :message="t('jellyseerr.settings.tasks_cache.flush_confirm')"
      danger
      @confirm="run(() => seerrApi.flushCache(), 'jellyseerr.settings.tasks_cache.flush_done')"
    />
  </SeerrPage>
</template>
