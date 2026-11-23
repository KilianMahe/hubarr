<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Shell de l'application connectée : tiroir, barre du haut, barre
// basse contextuelle sur mobile, contenu. Applique l'accent du service de la
// route affichée. Sur mobile (P5b.4, D138) : barre du haut
// « pilule » dans les vues de service, FAB du service (au centre de la barre
// basse, ou flottant), barre contextuelle pendant une sélection multiple.
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useDownloadWatchers } from '../app/download-watch';
import { pageHeader } from '../app/page-header';
import { chrome, FAB_QUERY, type FabSpec } from '../app/service-chrome';
import { useHubarrTheme } from '../app/theme/controller';
import AppTopBar from '../components/AppTopBar.vue';
import NavDrawer from '../components/NavDrawer.vue';
import QuickAddDialog from '../components/QuickAddDialog.vue';
import QuickLookSheet from '../components/QuickLookSheet.vue';
import ServiceBottomNav from '../components/ServiceBottomNav.vue';
import ServiceFab from '../components/ServiceFab.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const theme = useHubarrTheme();
const { lgAndUp, smAndDown } = useDisplay();

const drawer = ref(lgAndUp.value);
watch(lgAndUp, (wide) => (drawer.value = wide));
// Sur mobile, le tiroir se referme à chaque navigation.
watch(
  () => route.fullPath,
  () => {
    if (!lgAndUp.value) drawer.value = false;
  },
);

const routeTitle = computed(() => {
  const key = [...route.matched].reverse().find((record) => record.meta.titleKey)?.meta.titleKey;
  return key ? t(key) : '';
});
// Un seul titre par écran (E5) : celui de l'en-tête de la page s'il y en a un,
// affiché dans la barre sur mobile, laissé à la page sur grand écran.
const title = computed(() => {
  if (pageHeader.owner === 0) return routeTitle.value;
  return smAndDown.value ? pageHeader.title : '';
});
const subtitle = computed(() =>
  pageHeader.owner !== 0 && smAndDown.value ? pageHeader.subtitle : null,
);
const service = computed(
  () => [...route.matched].reverse().find((record) => record.meta.service)?.meta.service ?? null,
);
watch(
  service,
  (next) => {
    theme.setService(next);
  },
  { immediate: true },
);
onUnmounted(() => {
  theme.setService(null);
});
useDownloadWatchers();

// Lien d'évitement : place le focus sur le contenu (le tiroir et la barre sont sautés).
const main = ref<{ $el: HTMLElement } | null>(null);
function focusMain(): void {
  main.value?.$el.focus();
}
const bottomNav = computed(() => route.matched.flatMap((record) => record.meta.bottomNav ?? []));

// Habillage mobile des vues de service (D138).
const mobileService = computed(
  () =>
    smAndDown.value && route.matched.some((r) => Boolean(r.meta.service ?? r.meta.serviceParam)),
);
const selection = computed(() => (smAndDown.value ? chrome.selection.value : null));
// FAB : celui de la page (speed-dial des fiches…), sinon celui de la route,
// qui mène à la page d'index du service avec `?action=` (`useFabQueryAction`).
const fab = computed<FabSpec | null>(() => {
  if (!smAndDown.value) return null;
  if (chrome.fab.value) return chrome.fab.value;
  const spec = [...route.matched].reverse().find((r) => r.meta.fab)?.meta.fab;
  if (!spec) return null;
  return {
    icon: spec.icon,
    label: t(spec.labelKey),
    testId: spec.testId,
    onClick: () => {
      const target = { name: spec.index, query: { [FAB_QUERY]: spec.action } };
      void (route.name === spec.index ? router.replace(target) : router.push(target));
    },
  };
});
</script>

<template>
  <!-- Lien d'évitement (P5.5) : premier arrêt du clavier, visible au focus. -->
  <a href="#main-content" class="skip-link" data-test="skip-link" @click.prevent="focusMain">{{
    t('common.labels.skip_to_content')
  }}</a>
  <NavDrawer v-model="drawer" :permanent="lgAndUp" />
  <AppTopBar
    :title="title"
    :subtitle="subtitle"
    :show-nav-toggle="!lgAndUp"
    :pill="mobileService"
    :search="mobileService ? chrome.search.value : null"
    :stats="mobileService ? chrome.stats.value : null"
    :selection="selection"
    @toggle-nav="drawer = !drawer"
  />
  <v-main id="main-content" ref="main" tabindex="-1" class="main-content">
    <router-view />
  </v-main>
  <template v-if="smAndDown && !selection">
    <ServiceBottomNav v-if="bottomNav.length > 0" :items="bottomNav" :fab="fab" />
    <ServiceFab v-else-if="fab" :fab="fab" floating />
  </template>
  <QuickLookSheet />
  <QuickAddDialog />
</template>

<style scoped>
.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 2000;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  transform: translateY(-200%);
  transition: transform 0.15s;
}
.skip-link:focus {
  transform: translateY(0);
}
.main-content:focus {
  outline: none;
}
</style>
