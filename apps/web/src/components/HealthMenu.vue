<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Menu santé de la barre du haut (`topbar-health` de `base.html.twig`) : pastille
// globale (vert : tout répond ; orange : une partie ; rouge : rien de configuré
// ou tout injoignable), résumé, puis une ligne par service configuré et par
// instance (les services non configurés sont omis, P5c.3, V2).
import {
  HEALTH_FLAT_SERVICES,
  SERVICE_SETTINGS,
  type ServicesHealthResponse,
} from '@hubarr/shared';
import { msMonitorHeart } from './symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useServicesHealth } from '../app/health';

const { t } = useI18n();
const health = useServicesHealth();

interface Row {
  key: string;
  name: string;
  state: boolean | null | undefined;
}

type ConfiguredRow = Row & { state: boolean };

function rowsOf(data: ServicesHealthResponse): ConfiguredRow[] {
  const rows: Row[] = [
    { key: 'tmdb', name: SERVICE_SETTINGS.tmdb.label, state: data.services.tmdb },
  ];
  for (const type of ['radarr', 'sonarr'] as const) {
    const instances = data.instances[type];
    if (instances.length === 0)
      rows.push({ key: type, name: SERVICE_SETTINGS[type].label, state: data.services[type] });
    else
      rows.push(
        ...instances.map((row) => ({
          key: `${type}:${row.slug}`,
          name: row.name,
          state: row.state,
        })),
      );
  }
  for (const id of HEALTH_FLAT_SERVICES) {
    if (id !== 'tmdb')
      rows.push({ key: id, name: SERVICE_SETTINGS[id].label, state: data.services[id] });
  }
  return rows.filter((row): row is ConfiguredRow => typeof row.state === 'boolean');
}

const rows = computed(() => (health.data.value ? rowsOf(health.data.value) : []));

const color = computed(() => {
  const data = health.data.value;
  if (data === undefined) return 'muted';
  if (data.total === 0 || data.ok === 0) return 'error';
  return data.ok === data.total ? 'success' : 'warning';
});

const summary = computed(() => {
  const data = health.data.value;
  if (data === undefined) return t('topbar.health.loading');
  if (data.total === 0) return t('topbar.health.summary_no_service');
  return t('topbar.health.summary_running', { ok: data.ok, total: data.total });
});

function stateLabel(state: boolean): string {
  return state ? t('topbar.health.status.ok') : t('topbar.health.status.down');
}

function stateColor(state: boolean): string {
  return state ? 'success' : 'error';
}
</script>

<template>
  <v-menu location="bottom end" :close-on-content-click="false">
    <template #activator="{ props }">
      <v-btn v-bind="props" icon :aria-label="t('topbar.health.title')" data-test="health-menu">
        <v-badge dot :color="color" data-test="health-dot" :data-color="color">
          <v-icon :icon="msMonitorHeart" />
        </v-badge>
      </v-btn>
    </template>
    <v-card min-width="280" max-width="340">
      <v-card-title class="text-title-medium pb-0">{{ t('topbar.health.title') }}</v-card-title>
      <v-card-subtitle data-test="health-summary">{{ summary }}</v-card-subtitle>
      <v-list density="compact">
        <v-list-item
          v-for="row in rows"
          :key="row.key"
          :title="row.name"
          :data-health-row="row.key"
        >
          <template #prepend>
            <v-badge dot inline :color="stateColor(row.state)" class="me-3" />
          </template>
          <template #append>
            <span class="text-body-small text-muted">{{ stateLabel(row.state) }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>
