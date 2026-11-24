<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Onglets du groupe « Accueil » sur grand écran (lot 11) : Tableau de bord,
// Découverte, Calendrier, liens vers leurs routes (les URL ne changent pas).
// Sur mobile, les mêmes onglets forment la barre basse (`meta.bottomNav`).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { bottomNavActive, type BottomNavItem } from '../app/navigation';

const props = defineProps<{ items: BottomNavItem[] }>();
const { t } = useI18n();
const route = useRoute();
const active = computed(
  () => props.items.find((item) => bottomNavActive(item, route))?.to.name ?? null,
);
</script>

<template>
  <nav class="home-tabs px-4 pt-2" :aria-label="t('sidebar.nav.home')" data-test="home-tabs">
    <v-tabs :model-value="active" color="primary" density="compact" show-arrows>
      <v-tab
        v-for="item in items"
        :key="item.to.name"
        :value="item.to.name"
        :to="item.to"
        :prepend-icon="item.icon"
        :data-test="item.testId"
        >{{ t(item.labelKey) }}</v-tab
      >
    </v-tabs>
  </nav>
</template>

<style scoped>
.home-tabs {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
