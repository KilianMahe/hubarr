<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Onglets de Tracearr sur grand écran (D143) ; sur mobile, la barre basse les
// remplace. Partagés par la page Tracearr et la fiche utilisateur (P5d.2).
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { TRACEARR_ROUTES, TRACEARR_SECTIONS, type TracearrSection } from './tracearr-nav';

defineProps<{ section: TracearrSection }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();
</script>

<template>
  <v-tabs
    v-if="!smAndDown"
    :model-value="section"
    color="service-text"
    density="compact"
    show-arrows
    class="mb-3"
    data-test="tracearr-nav"
  >
    <v-tab
      v-for="item in TRACEARR_SECTIONS"
      :key="item"
      :value="item"
      :to="{ name: TRACEARR_ROUTES[item].name }"
      >{{ t(`tracearr.nav.${item}`) }}</v-tab
    >
  </v-tabs>
</template>
