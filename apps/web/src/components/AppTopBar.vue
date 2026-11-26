<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Barre du haut : menu (mobile), titre de l'écran, centre de notifications,
// bascule de thème et menu santé des services ; le compte est dans le menu latéral seulement (P5d.4, V34). Teintée par l'accent du service affiché
// ; recherche globale (P4.5, admins).
// Sur mobile, dans une vue de service (P5b.4, E4, D131), elle devient une
// « pilule » sur un dégradé teinté par le service : menu, titre de l'écran
// (« Radarr · Films »), la cloche des notifications, puis la loupe : recherche globale, ou recherche locale
// de la page (bibliothèques) qui s'ouvre dans la pilule à la place du titre ;
// pendant une sélection multiple (E3), elle laisse place à la barre
// contextuelle de la sélection.
import { msClose, msSearch, msSelectAll, msVisibility } from './symbols';
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SelectionState, TopBarSearch } from '../app/service-chrome';
import { useSessionStore } from '../app/stores/session';
import GlobalSearch from './GlobalSearch.vue';
import HealthMenu from './HealthMenu.vue';
import NotificationCenter from './NotificationCenter.vue';
import ThemeToggle from './ThemeToggle.vue';

const props = defineProps<{
  title: string;
  subtitle?: string | null;
  showNavToggle: boolean;
  /** Barre « pilule » (mobile, vue de service). */
  pill?: boolean;
  search?: TopBarSearch | null;
  /** Sélection multiple en cours (mobile) : barre contextuelle. */
  selection?: SelectionState | null;
  /** Page d'un service en lecture seule pour le compte : pastille dans la barre. */
  readOnly?: boolean;
}>();
const emit = defineEmits<{ 'toggle-nav': [] }>();
const { t } = useI18n();
const session = useSessionStore();
// Recherche locale ouverte dans la pilule : d'office tant qu'un texte est saisi
// (retour sur la page, lien partagé), sinon par la loupe.
const searchOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
watch(
  () => props.search?.value ?? '',
  (value) => {
    if (value !== '') searchOpen.value = true;
  },
  { immediate: true },
);
watch(
  () => props.search,
  (search) => {
    if (!search) searchOpen.value = false;
  },
);
async function openSearch(): Promise<void> {
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}
function closeSearch(): void {
  if (props.search?.value) props.search.onInput('');
  searchOpen.value = false;
}
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
        :icon="msClose"
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
        :icon="msSelectAll"
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
      <!-- Recherche locale de la page, ouverte par la loupe -->
      <template v-if="search && searchOpen">
        <input
          ref="searchInput"
          :value="search.value"
          :placeholder="search.placeholder"
          :aria-label="search.placeholder"
          type="search"
          enterkeyhint="search"
          class="topbar-pill__search"
          data-test="topbar-search"
          @input="search.onInput(($event.target as HTMLInputElement).value)"
          @keydown.esc="closeSearch"
        />
        <v-btn
          :icon="msClose"
          variant="text"
          :aria-label="t('topbar.search.clear')"
          class="me-1"
          data-test="topbar-search-close"
          @click="closeSearch"
        />
      </template>
      <template v-else>
        <div class="topbar-pill__title">
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
        <v-icon
          v-if="readOnly"
          :icon="msVisibility"
          size="small"
          class="me-2 text-medium-emphasis"
          :aria-label="t('users.read_only.label')"
          :title="t('users.read_only.hint')"
          role="img"
          data-test="read-only-chip"
        />
        <NotificationCenter v-if="session.user" />
        <v-btn
          v-if="search"
          :icon="msSearch"
          variant="text"
          :aria-label="search.placeholder"
          class="me-1"
          data-test="topbar-search-open"
          @click="openSearch"
        />
        <GlobalSearch v-else-if="session.user" class="me-1" />
      </template>
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
      <v-chip
        v-if="readOnly"
        :prepend-icon="msVisibility"
        size="small"
        variant="tonal"
        class="me-2"
        :title="t('users.read_only.hint')"
        data-test="read-only-chip"
        >{{ t('users.read_only.label') }}</v-chip
      >
      <GlobalSearch v-if="session.user" class="me-2" />
      <NotificationCenter v-if="session.user" />
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
.topbar-pill__title {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 4px;
}
</style>
