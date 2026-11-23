<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Barre du haut : menu (mobile), titre de l'écran, bascule de thème et menu
// santé des services ; le compte est dans le menu latéral seulement (P5d.4, V34). Teintée par l'accent du service affiché
// ; recherche globale (P4.5, admins).
// Sur mobile, dans une vue de service (P5b.4, E4, D131), elle devient une
// « pilule » sur un dégradé teinté par le service : menu, puis la recherche
// locale de la page, ses compteurs ou son titre ; pendant une sélection
// multiple (E3), elle laisse place à la barre contextuelle de la sélection.
import { mdiClose, mdiMagnify, mdiSelectAll } from '@mdi/js';
import { useI18n } from 'vue-i18n';
import type { SelectionState, TopBarSearch, TopBarStat } from '../app/service-chrome';
import { useSessionStore } from '../app/stores/session';
import GlobalSearch from './GlobalSearch.vue';
import HealthMenu from './HealthMenu.vue';
import ThemeToggle from './ThemeToggle.vue';

defineProps<{
  title: string;
  subtitle?: string | null;
  showNavToggle: boolean;
  /** Barre « pilule » (mobile, vue de service). */
  pill?: boolean;
  search?: TopBarSearch | null;
  stats?: TopBarStat[] | null;
  /** Sélection multiple en cours (mobile) : barre contextuelle. */
  selection?: SelectionState | null;
}>();
const emit = defineEmits<{ 'toggle-nav': [] }>();
const { t } = useI18n();
const session = useSessionStore();
</script>

<template>
  <!-- Barre contextuelle de la sélection (mobile) -->
  <v-app-bar
    v-if="selection"
    color="service-container"
    flat
    density="comfortable"
    data-test="selection-bar"
  >
    <template #prepend>
      <v-btn
        :icon="mdiClose"
        :aria-label="t('common.ds.clear_selection')"
        data-test="selection-bar-clear"
        @click="selection.clear()"
      />
    </template>
    <v-app-bar-title>
      <span class="text-title-medium" role="status" data-test="selection-bar-count">{{
        t('common.ds.selected', { count: selection.count })
      }}</span>
    </v-app-bar-title>
    <template #append>
      <v-btn
        v-if="selection.selectAll"
        :icon="mdiSelectAll"
        :aria-label="selection.selectAllLabel ?? t('common.ds.select_all')"
        :title="selection.selectAllLabel ?? t('common.ds.select_all')"
        data-test="selection-bar-all"
        @click="selection.selectAll()"
      />
    </template>
  </v-app-bar>

  <!-- Barre « pilule » (mobile, vue de service) -->
  <v-app-bar v-else-if="pill" flat height="72" class="topbar-pill-bar" data-test="topbar-pill">
    <div class="topbar-pill">
      <v-btn
        v-if="showNavToggle"
        :icon="'$menu'"
        variant="text"
        :aria-label="t('topbar.nav.toggle')"
        data-test="nav-toggle"
        @click="emit('toggle-nav')"
      />
      <!-- Recherche locale de la page -->
      <input
        v-if="search"
        :value="search.value"
        :placeholder="search.placeholder"
        :aria-label="search.placeholder"
        type="search"
        enterkeyhint="search"
        class="topbar-pill__search"
        data-test="topbar-search"
        @input="search.onInput(($event.target as HTMLInputElement).value)"
      />
      <!-- Compteurs du service -->
      <div
        v-else-if="stats && stats.length > 0"
        class="topbar-pill__stats"
        data-test="topbar-stats"
      >
        <div v-for="stat in stats" :key="stat.label" class="topbar-pill__stat">
          <strong class="text-title-medium"
            >{{ stat.value
            }}<small v-if="stat.unit" class="topbar-pill__unit">{{ stat.unit }}</small></strong
          >
          <span class="text-body-small text-muted text-truncate">{{ stat.label }}</span>
        </div>
      </div>
      <div v-else class="topbar-pill__title">
        <span class="d-block text-title-medium text-truncate" data-test="topbar-title">{{
          title
        }}</span>
        <span
          v-if="subtitle"
          class="d-block text-body-small text-truncate topbar-subtitle"
          data-test="topbar-subtitle"
          >{{ subtitle }}</span
        >
      </div>
      <v-icon v-if="search && !search.value" :icon="mdiMagnify" class="me-3 text-muted" />
      <GlobalSearch v-if="session.user && !search" class="me-1" />
    </div>
  </v-app-bar>

  <v-app-bar v-else color="service-bar" flat border="b" density="comfortable">
    <template #prepend>
      <v-app-bar-nav-icon
        v-if="showNavToggle"
        :aria-label="t('topbar.nav.toggle')"
        data-test="nav-toggle"
        @click="emit('toggle-nav')"
      />
    </template>
    <v-app-bar-title>
      <span class="d-block text-title-large text-truncate" data-test="topbar-title">{{
        title
      }}</span>
      <span
        v-if="subtitle"
        class="d-block text-body-small text-truncate topbar-subtitle"
        data-test="topbar-subtitle"
        >{{ subtitle }}</span
      >
    </v-app-bar-title>
    <template #append>
      <GlobalSearch v-if="session.user" class="me-2" />
      <HealthMenu v-if="session.user" />
      <ThemeToggle />
    </template>
  </v-app-bar>
</template>

<style scoped>
.topbar-subtitle {
  margin-top: -2px;
  opacity: 0.75;
}
/* Dégradé teinté par le service sous la pilule (D54). */
.topbar-pill-bar {
  background: linear-gradient(
    to bottom,
    rgb(var(--v-theme-service-bar)),
    rgb(var(--v-theme-background))
  );
}
.topbar-pill {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  height: 52px;
  margin: 0 12px;
  padding: 0 4px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 26px;
  background: rgba(var(--v-theme-surface), 0.72);
  backdrop-filter: blur(8px);
}
.topbar-pill__search {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}
.topbar-pill__search::placeholder {
  color: rgb(var(--v-theme-muted));
}
.topbar-pill__search:focus-visible {
  box-shadow: inset 0 -2px 0 rgb(var(--v-theme-service-text));
}
.topbar-pill__stats {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}
.topbar-pill__stat {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  line-height: 1.15;
}
.topbar-pill__stat + .topbar-pill__stat {
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.topbar-pill__unit {
  margin-left: 2px;
  color: rgb(var(--v-theme-service-text));
  font-size: 0.7em;
}
.topbar-pill__title {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 4px;
}
</style>
