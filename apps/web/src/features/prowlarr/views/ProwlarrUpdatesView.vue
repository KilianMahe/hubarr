<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Mises à jour de Prowlarr (`prowlarr/updates.html.twig`, n° 282) : version
// installée, versions (dernière, installée, disponible, ancienne) et leurs
// changements ; en conteneur, mise à jour par l'image ; sinon vérification
// lancée par la commande `ApplicationUpdateCheck` (comme l'original).
import { updatesPageSchema } from '@hubarr/shared';
import { ref } from 'vue';
import { useFormat } from '../../../app/format';
import { fillLegacy } from '../../../app/legacy-template';
import ProwlarrPage from '../ProwlarrPage.vue';
import { prowlarrApi, useProwlarrPage } from '../prowlarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const format = useFormat();
const { query, feedback, error, run, t } = useProwlarrPage('/updates', updatesPageSchema);
const installing = ref(false);

async function install(): Promise<void> {
  installing.value = true;
  await run(
    () => prowlarrApi.command('ApplicationUpdateCheck'),
    'prowlarr.updates.install_error',
    t('prowlarr.updates.install_launched'),
  );
  installing.value = false;
}
const latest = () => query.data.value?.updates.find((update) => update.latest) ?? null;
const statusOf = (update: { installed: boolean; installable: boolean }) =>
  update.installed
    ? t('prowlarr.updates.status_installed')
    : update.installable
      ? t('prowlarr.updates.status_available')
      : t('prowlarr.updates.status_old');
</script>

<template>
  <ProwlarrPage
    v-model:feedback="feedback"
    :title="t('prowlarr.updates.title')"
    :loading="query.isPending.value"
    :error="error"
  >
    <template v-if="query.data.value">
      <v-alert
        v-if="query.data.value.docker"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3"
      >
        <!-- Message du catalogue (balise <code>), jamais une valeur de Prowlarr. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="t('prowlarr.updates.docker_warning')" />
      </v-alert>
      <v-card variant="flat" border class="mb-3">
        <v-card-text class="d-flex flex-wrap align-center ga-3">
          <div>
            <div class="text-body-small text-muted">
              {{ t('prowlarr.updates.version_installed') }}
            </div>
            <div class="text-title-large" data-test="update-version">
              {{ query.data.value.version ?? '—' }}
            </div>
          </div>
          <v-chip
            :color="latest() && !latest()?.installed ? 'warning' : 'success'"
            variant="tonal"
            >{{
              latest() && !latest()?.installed
                ? t('prowlarr.updates.update_available')
                : t('prowlarr.updates.up_to_date')
            }}</v-chip
          >
          <v-spacer />
          <v-btn
            v-if="!query.data.value.docker && latest() && !latest()?.installed"
            color="service"
            :loading="installing"
            data-test="update-install"
            @click="install"
            >{{
              fillLegacy(t('prowlarr.updates.install_btn_tpl'), {
                VERSION: latest()?.version ?? '',
              })
            }}</v-btn
          >
        </v-card-text>
      </v-card>
      <h2 class="text-title-medium mb-2">{{ t('prowlarr.updates.history_title') }}</h2>
      <EmptyState
        v-if="query.data.value.updates.length === 0"
        inline
        :title="t('prowlarr.updates.empty')"
      />
      <v-card
        v-for="update in query.data.value.updates"
        :key="update.version"
        variant="flat"
        border
        class="mb-2"
        data-test="update-row"
      >
        <v-card-text>
          <div class="d-flex flex-wrap align-center ga-2 mb-1">
            <span class="font-weight-medium">{{ update.version }}</span>
            <v-chip v-if="update.latest" size="x-small" color="service-text" variant="tonal">{{
              t('prowlarr.updates.badge_latest')
            }}</v-chip>
            <v-chip
              size="x-small"
              variant="tonal"
              :color="update.installed ? 'success' : undefined"
              >{{ statusOf(update) }}</v-chip
            >
            <span class="text-body-small text-muted">{{ update.branch ?? '' }}</span>
            <v-spacer />
            <span class="text-body-small text-muted">{{
              update.releaseDate ? format.date(update.releaseDate) : '—'
            }}</span>
          </div>
          <template v-if="update.changes.new.length > 0">
            <div class="text-body-small font-weight-medium mt-1">
              {{ t('prowlarr.updates.changes_new') }}
            </div>
            <ul class="text-body-small ps-4">
              <li v-for="(change, index) in update.changes.new" :key="index">{{ change }}</li>
            </ul>
          </template>
          <template v-if="update.changes.fixed.length > 0">
            <div class="text-body-small font-weight-medium mt-1">
              {{ t('prowlarr.updates.changes_fixed') }}
            </div>
            <ul class="text-body-small ps-4">
              <li v-for="(change, index) in update.changes.fixed" :key="index">{{ change }}</li>
            </ul>
          </template>
        </v-card-text>
      </v-card>
    </template>
  </ProwlarrPage>
</template>
