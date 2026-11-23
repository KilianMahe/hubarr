<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Mises à jour de l'instance (`radarr/updates.html.twig`) : version
// installée, mise à jour disponible ou « à jour », historique des versions
// (branche, date, statut, nouveautés et corrections) ; installation, sauf en
// conteneur (mise à jour par l'image, avertissement).
import { arrCommandStartedSchema, updatesPageSchema } from '@hubarr/shared';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';

const { t } = useI18n();
const format = useFormat();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'updates',
  '/mises-a-jour',
  updatesPageSchema,
);
const page = computed(() => query.data.value);
const available = computed(() => (page.value?.updates ?? []).some((update) => update.installable));

const installing = ref(false);
async function install(): Promise<void> {
  installing.value = true;
  await run(
    () => ctx.post('/mises-a-jour/installer', {}, arrCommandStartedSchema),
    ctx.key('install_error'),
    t(ctx.key('install_started')),
  );
  installing.value = false;
}
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="page?.updates.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <template v-if="page">
      <v-alert
        v-if="page.docker"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-test="updates-docker"
        >{{ t(ctx.kindKey('docker_warning')) }}</v-alert
      >
      <v-card v-if="page.version" variant="flat" border class="mb-4">
        <v-card-text class="d-flex align-center ga-4">
          <div>
            <div class="text-body-small text-muted">{{ t(ctx.key('installed_version')) }}</div>
            <div class="text-headline-small text-service-text" data-test="updates-version">
              {{ page.version }}
            </div>
          </div>
          <v-spacer />
          <v-chip :color="available ? 'warning' : 'success'" variant="tonal">{{
            t(ctx.key(available ? 'update_available' : 'up_to_date'))
          }}</v-chip>
        </v-card-text>
      </v-card>
      <v-card variant="flat" border>
        <v-card-title class="text-title-medium">{{ t(ctx.key('history_title')) }}</v-card-title>
        <v-card-text v-if="page.updates.length === 0" class="text-center text-muted">{{
          t(ctx.kindKey('empty'))
        }}</v-card-text>
        <v-list v-else density="compact">
          <v-list-item v-for="update in page.updates" :key="update.version" data-test="update-row">
            <div class="d-flex flex-wrap align-center ga-2">
              <span class="font-weight-medium">{{ update.version }}</span>
              <v-chip v-if="update.latest" size="x-small" color="purple" variant="tonal">{{
                t(ctx.key('latest'))
              }}</v-chip>
              <v-chip v-if="update.branch" size="x-small" variant="tonal">{{
                update.branch
              }}</v-chip>
              <span class="text-body-small text-muted">{{
                update.releaseDate === null ? '—' : (format.date(update.releaseDate) ?? '—')
              }}</span>
              <v-spacer />
              <v-chip v-if="update.installed" size="x-small" color="success" variant="tonal">{{
                t(ctx.key('installed'))
              }}</v-chip>
              <template v-else-if="update.installable">
                <v-chip size="x-small" color="warning" variant="tonal">{{
                  t(ctx.key('available'))
                }}</v-chip>
                <span v-if="page.docker" class="text-body-small text-muted font-italic">{{
                  t(ctx.key('via_docker'))
                }}</span>
                <v-btn
                  v-else
                  size="small"
                  color="warning"
                  variant="flat"
                  :loading="installing"
                  data-test="update-install"
                  @click="install"
                  >{{ t(ctx.key('install')) }}</v-btn
                >
              </template>
              <v-chip v-else size="x-small" variant="tonal">{{ t(ctx.key('old')) }}</v-chip>
            </div>
            <div v-if="update.changes.new.length > 0" class="mt-1">
              <div class="text-body-small text-success font-weight-medium">
                {{ t(ctx.key('changes_new')) }}
              </div>
              <ul class="update-changes">
                <li v-for="(change, index) in update.changes.new" :key="index">{{ change }}</li>
              </ul>
            </div>
            <div v-if="update.changes.fixed.length > 0" class="mt-1">
              <div class="text-body-small text-info font-weight-medium">
                {{ t(ctx.key('changes_fixed')) }}
              </div>
              <ul class="update-changes">
                <li v-for="(change, index) in update.changes.fixed" :key="index">{{ change }}</li>
              </ul>
            </div>
          </v-list-item>
        </v-list>
      </v-card>
    </template>
  </AdminPage>
</template>

<style scoped>
.update-changes {
  padding-left: 1.2rem;
  font-size: 0.8rem;
  opacity: 0.8;
}
</style>
