<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Barre de navigation basse d'un service, sur mobile (P5b.4 E6,
// D131) : onglets du service avec leur libellé sous l'icône, indicateur à
// l'accent du service et, au centre, le bouton d'action
// principal (FAB, E2). Les vues de service la déclarent par `meta.bottomNav`.
// Un onglet à menu (groupe des paramètres d'un service) ouvre la liste de ses
// pages au-dessus de la barre au lieu de naviguer.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { bottomNavActive, type BottomNavItem } from '../app/navigation';
import type { FabSpec } from '../app/service-chrome';
import ServiceFab from './ServiceFab.vue';

const props = defineProps<{ items: BottomNavItem[]; fab?: FabSpec | null }>();
const { t } = useI18n();
const route = useRoute();
// Le FAB se place au milieu : onglets répartis de part et d'autre.
const split = computed(() => Math.ceil(props.items.length / 2));
const before = computed(() => (props.fab ? props.items.slice(0, split.value) : props.items));
const after = computed(() => (props.fab ? props.items.slice(split.value) : []));
</script>

<template>
  <v-bottom-navigation
    grow
    color="on-service-container"
    bg-color="surface"
    height="64"
    class="service-bottom-nav"
    data-test="service-bottom-nav"
  >
    <template v-for="(group, index) in [before, after]" :key="index">
      <ServiceFab v-if="index === 1 && fab" :fab="fab" class="service-bottom-nav__fab" />
      <template v-for="item in group" :key="item.labelKey">
        <v-menu v-if="item.menu" location="top" max-height="70vh">
          <template #activator="{ props: activator }">
            <v-btn
              v-bind="activator"
              :value="item.labelKey"
              :active="bottomNavActive(item, route)"
              class="service-bottom-nav__item"
              :data-test="item.testId ?? `bottom-nav-${item.labelKey}`"
            >
              <v-icon :icon="item.icon" />
              <span class="service-bottom-nav__label">{{ t(item.labelKey) }}</span>
            </v-btn>
          </template>
          <v-list density="compact" nav :aria-label="t(item.labelKey)">
            <v-list-item
              v-for="entry in item.menu"
              :key="entry.id"
              :to="entry.to"
              :prepend-icon="entry.icon"
              :title="t(entry.labelKey)"
              :active="route.name === entry.id"
              color="service-text"
              :data-test="`admin-link-${entry.id}`"
            />
          </v-list>
        </v-menu>
        <v-btn
          v-else
          :to="item.to"
          :replace="item.replace === true"
          :value="item.labelKey"
          :active="bottomNavActive(item, route)"
          class="service-bottom-nav__item"
          :data-test="item.testId ?? `bottom-nav-${item.labelKey}`"
        >
          <v-badge v-if="item.badge" :content="item.badge" color="error">
            <v-icon :icon="item.icon" />
          </v-badge>
          <v-icon v-else :icon="item.icon" />
          <span class="service-bottom-nav__label">{{ t(item.labelKey) }}</span>
        </v-btn>
      </template>
    </template>
  </v-bottom-navigation>
</template>

<style scoped>
.service-bottom-nav__item {
  min-width: 0;
  padding: 0 2px;
}
.service-bottom-nav__item .v-icon {
  border-radius: 16px;
  padding: 4px 16px;
  box-sizing: content-box;
}
.service-bottom-nav__item.v-btn--active :deep(.v-btn__overlay) {
  opacity: 0;
}
.service-bottom-nav__item.v-btn--active .v-icon {
  background: rgb(var(--v-theme-service-container));
}
.service-bottom-nav__label {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  text-transform: none;
  letter-spacing: normal;
  white-space: nowrap;
}
.service-bottom-nav__fab {
  flex: 0 0 auto;
  padding: 0 8px;
}
</style>
