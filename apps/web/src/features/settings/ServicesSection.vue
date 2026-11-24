<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section « Services externes » (`admin/_services_list.html.twig`) : services
// regroupés par catégorie, recherche, services connectés en premier et ouverts.
import {
  SERVICE_SETTINGS,
  SETTINGS_SERVICE_GROUPS,
  isInstanceType,
  type FlatServiceId,
  type ServiceId,
  type SettingsResponse,
} from '@hubarr/shared';
import { msSearch } from '../../components/symbols';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useServicesHealth } from '../../app/health';
import { useNotifyStore } from '../../app/stores/notify';
import InstancesPanel from './InstancesPanel.vue';
import ServiceCard from './ServiceCard.vue';
import { SETTINGS_KEY, saveSettings } from './settings-api';
import { healthStateOf, type HealthState } from './service-status';

const props = defineProps<{ settings: SettingsResponse }>();
const { t } = useI18n();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const health = useServicesHealth();
const search = ref('');

function isConnected(id: ServiceId): boolean {
  return isInstanceType(id)
    ? props.settings.instances[id].length > 0
    : props.settings.services[id].saved;
}

const subtitleKey = (id: ServiceId) =>
  `admin.services.subtitle.${id === 'seerr' ? 'jellyseerr' : id}`;

const groups = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return SETTINGS_SERVICE_GROUPS.map((group) => {
    const ids = (group.ids as readonly ServiceId[]).filter(
      (id) =>
        needle === '' ||
        `${SERVICE_SETTINGS[id].label} ${t(subtitleKey(id))}`.toLowerCase().includes(needle),
    );
    // Services connectés d'abord, puis les autres.
    return {
      labelKey: group.labelKey,
      ids: [...ids.filter(isConnected), ...ids.filter((id) => !isConnected(id))],
    };
  }).filter((group) => group.ids.length > 0);
});

const noneConnected = computed(() =>
  SETTINGS_SERVICE_GROUPS.every((group) => group.ids.every((id) => !isConnected(id))),
);

// Services connectés ouverts au premier affichage, comme l'original ; sur
// mobile, liste compacte repliée, dépliée à la demande (P5b.1 R2).
const opened = ref<string[]>([]);
const { smAndDown } = useDisplay();
watch(
  () => props.settings,
  (settings, previous) => {
    if (previous !== undefined || smAndDown.value) return;
    opened.value = SETTINGS_SERVICE_GROUPS.flatMap(
      (group) => group.ids as readonly ServiceId[],
    ).filter((id) =>
      isInstanceType(id) ? settings.instances[id].length > 0 : settings.services[id].saved,
    );
  },
  { immediate: true },
);

function healthOf(id: ServiceId): HealthState {
  if (health.isError.value) return 'unknown';
  return healthStateOf(health.data.value?.services[id]);
}

function instanceHealth(type: 'radarr' | 'sonarr'): Record<string, HealthState> {
  const rows = health.data.value?.instances[type] ?? [];
  return Object.fromEntries(rows.map((row) => [row.slug, healthStateOf(row.state)]));
}

const sidebar = useMutation({
  mutationFn: (change: Record<string, boolean>) => saveSettings({ sidebar: change }),
  onSuccess: (next) => {
    queryClient.setQueryData(SETTINGS_KEY, next);
    notify.success('admin.flash.saved');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});

const flat = (id: ServiceId) => id as FlatServiceId;
</script>

<template>
  <section id="section-services" data-section="services">
    <h2 class="text-title-large mb-1">{{ t('admin.services.title') }}</h2>
    <!-- Message du catalogue (balise <em>), jamais de valeur venue d'un service. -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <p class="text-body-medium text-muted mb-4" v-html="t('admin.services.description')" />

    <v-text-field
      v-model="search"
      :prepend-inner-icon="msSearch"
      :placeholder="t('admin.services.search_placeholder')"
      :aria-label="t('admin.services.search_placeholder')"
      density="compact"
      hide-details
      clearable
      class="mb-4"
      style="max-width: 360px"
    />
    <p v-if="noneConnected" class="text-body-medium text-muted mb-4">
      {{ t('admin.services.none_connected') }}
    </p>

    <div v-for="group in groups" :key="group.labelKey" class="mb-6">
      <div class="text-label-large text-muted text-uppercase mb-2">{{ t(group.labelKey) }}</div>
      <v-expansion-panels v-model="opened" multiple variant="accordion" class="border rounded-lg">
        <template v-for="id in group.ids" :key="id">
          <InstancesPanel
            v-if="id === 'radarr' || id === 'sonarr'"
            :type="id"
            :instances="settings.instances[id]"
            :sidebar-visible="settings.sidebar[id] ?? true"
            :health="instanceHealth(id)"
            @sidebar="(visible) => sidebar.mutate({ [id]: visible })"
          />
          <ServiceCard
            v-else
            :id="flat(id)"
            :state="settings.services[flat(id)]"
            :sidebar-visible="settings.sidebar[id] ?? true"
            :health="healthOf(id)"
          />
        </template>
      </v-expansion-panels>
    </div>
    <p v-if="groups.length === 0" class="text-body-medium text-muted">
      {{ t('admin.services.no_match') }}
    </p>
  </section>
</template>
