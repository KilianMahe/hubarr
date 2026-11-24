<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Navigation des pages de paramètres d'un service (P5d.3, V24),
// ouvertes par le bouton « Paramètres » de sa carte dans `/admin/settings` :
// retour aux paramètres, puis une rangée d'onglets par groupe (configuration,
// système…) et une seconde avec les pages du groupe courant. Le service vient
// de la route (`meta.service`), l'instance Radarr/Sonarr de son `slug`. Sur
// mobile, la barre basse du shell porte les groupes et leurs pages : seul le
// retour reste ici.
import { SERVICE_SETTINGS } from '@hubarr/shared';
import { msArrowBack } from './symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import {
  SETTINGS_SERVICES_LOCATION,
  activeAdminGroup,
  isAdministered,
  serviceAdminGroups,
} from '../app/service-admin';

const { t } = useI18n();
const route = useRoute();
const { smAndDown } = useDisplay();
const service = computed(() => {
  const value = route.meta.service;
  return typeof value === 'string' && isAdministered(value) ? value : null;
});
const groups = computed(() =>
  service.value === null ? [] : serviceAdminGroups(service.value, String(route.params.slug ?? '')),
);
const group = computed(() => activeAdminGroup(groups.value, route.name));
const label = computed(() => (service.value === null ? '' : SERVICE_SETTINGS[service.value].label));
</script>

<template>
  <nav class="service-settings-nav mb-3" data-test="service-settings-nav">
    <v-btn
      :to="SETTINGS_SERVICES_LOCATION"
      :prepend-icon="msArrowBack"
      variant="tonal"
      size="small"
      rounded="pill"
      class="mb-2"
      data-test="settings-back"
      >{{ t('admin.service_admin.back') }}</v-btn
    >
    <template v-if="groups.length > 0 && !smAndDown">
      <v-tabs
        :model-value="group?.labelKey"
        color="service-text"
        density="compact"
        show-arrows
        :aria-label="t('admin.service_admin.groups', { service: label })"
        data-test="service-settings-groups"
      >
        <v-tab
          v-for="item in groups"
          :key="item.labelKey"
          :value="item.labelKey"
          :to="item.links[0]?.to"
          data-test="admin-group"
          >{{ t(item.labelKey) }}</v-tab
        >
      </v-tabs>
      <v-tabs
        v-if="group"
        :model-value="route.name"
        color="service-text"
        density="compact"
        show-arrows
        class="service-settings-nav__pages"
        :aria-label="t(group.labelKey)"
        data-test="service-settings-pages"
      >
        <v-tab
          v-for="item in group.links"
          :key="item.id"
          :value="item.id"
          :to="item.to"
          :prepend-icon="item.icon"
          size="small"
          :data-test="`admin-link-${item.id}`"
          >{{ t(item.labelKey) }}</v-tab
        >
      </v-tabs>
    </template>
  </nav>
</template>

<style scoped>
.service-settings-nav__pages {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
