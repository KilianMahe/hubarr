<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Navigation de Bazarr (`bazarr/_nav.html.twig`) : recherchés, films, séries,
// historique. Sur mobile, la barre basse la remplace (P5b.4).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { bottomNavActive } from '../../app/navigation';
import { BAZARR_TABS } from './bazarr-nav';

const { t } = useI18n();
const route = useRoute();
const { smAndDown } = useDisplay();
const active = computed(
  () => BAZARR_TABS.find((tab) => bottomNavActive(tab, route))?.to.name ?? null,
);
</script>

<template>
  <v-tabs
    v-if="!smAndDown"
    :model-value="active"
    color="service-text"
    density="compact"
    show-arrows
    class="mb-3"
    data-test="bazarr-nav"
  >
    <v-tab
      v-for="tab in BAZARR_TABS"
      :key="tab.to.name"
      :value="tab.to.name"
      :to="tab.to"
      :prepend-icon="tab.icon"
      >{{ t(tab.labelKey) }}</v-tab
    >
  </v-tabs>
</template>
