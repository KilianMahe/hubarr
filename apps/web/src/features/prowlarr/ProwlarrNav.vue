<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// En-tête de service et navigation de Prowlarr (`_prowlarr_nav.html.twig`) : onglets (indexeurs,
// historique). Les pages « Paramètres » et « Système » s'ouvrent depuis les
// paramètres de Hubarr (P5c.4, D140) et affichent un lien de retour et les
// onglets des paramètres du service (P5d.3). Sur
// mobile (P5b.4, D138), la barre basse remplace les onglets.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { PROWLARR_PAGES } from './prowlarr-pages';
import ServiceSettingsNav from '../../components/ServiceSettingsNav.vue';
import { SERVICE_SETTINGS } from '@hubarr/shared';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';

const { t } = useI18n();
const route = useRoute();
const { smAndDown } = useDisplay();
const active = computed(() =>
  PROWLARR_PAGES.some((page) => page.name === route.name) ? route.name : null,
);
const settingsPage = computed(() => route.meta.serviceSettings === true);
</script>

<template>
  <ServiceHeader service="prowlarr" :title="SERVICE_SETTINGS.prowlarr.label" />
  <ServiceSettingsNav v-if="settingsPage" />
  <div v-else-if="!smAndDown" class="d-flex align-center mb-3" data-test="prowlarr-nav">
    <v-tabs
      :model-value="active"
      color="service-text"
      density="compact"
      show-arrows
      class="flex-grow-1 prowlarr-nav__tabs"
    >
      <v-tab
        v-for="page in PROWLARR_PAGES"
        :key="page.name"
        :value="page.name"
        :to="{ name: page.name }"
        :prepend-icon="page.icon"
        >{{ t(page.labelKey) }}</v-tab
      >
    </v-tabs>
  </div>
</template>

<style scoped>
.prowlarr-nav__tabs {
  min-width: 0;
}
</style>
