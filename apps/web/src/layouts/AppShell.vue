<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Shell de l'application connectée : tiroir, barre du haut, barre
// basse contextuelle sur mobile, contenu. Applique l'accent du service de la
// route affichée. Sur mobile (P5b.4, D138) : barre du haut
// « pilule » dans les vues de service, FAB du service (au centre de la barre
// basse, ou flottant), barre contextuelle pendant une sélection multiple.
// Pages de paramètres (`/admin/settings` et administration d'un service) :
// barre basse des sections ou des groupes, et titre « Service · Page ».
// Groupe « Accueil » (lot 11) : onglets Tableau de bord, Découverte,
// Calendrier en haut de page sur grand écran, barre basse sur mobile.
// Pendant le rafraîchissement des données restaurées du cache persistant, un
// fin liseré en haut de l'écran signale la mise à jour.
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { pageReadOnly, useServiceAccess } from '../app/access';
import { useDownloadWatchers } from '../app/download-watch';
import { pageHeader } from '../app/page-header';
import { useRestoredRefreshing } from '../app/query-persist';
import { SERVICE_SETTINGS } from '@hubarr/shared';
import { isHomeRoute, visibleBottomNav } from '../app/home-tabs';
import { bottomNavActive, type BottomNavItem } from '../app/navigation';
import { serviceOfRoute } from '../app/router/guards';
import { useSessionStore } from '../app/stores/session';
import {
  isAdministered,
  serviceSettingsBottomNav,
  serviceSettingsLink,
} from '../app/service-admin';
import { chrome, FAB_QUERY, type FabSpec } from '../app/service-chrome';
import { useHubarrTheme } from '../app/theme/controller';
import AppTopBar from '../components/AppTopBar.vue';
import HomeTabs from '../components/HomeTabs.vue';
import NavDrawer from '../components/NavDrawer.vue';
import QuickAddDialog from '../components/QuickAddDialog.vue';
import QuickLookSheet from '../components/QuickLookSheet.vue';
import ServiceBottomNav from '../components/ServiceBottomNav.vue';
import ServiceFab from '../components/ServiceFab.vue';
import { settingsSectionLabelKey } from '../features/settings/sections';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const theme = useHubarrTheme();
const { lgAndUp, smAndDown } = useDisplay();
const refreshing = useRestoredRefreshing();
const session = useSessionStore();

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
// Administration d'un service ouverte depuis les paramètres (D140).
const settingsService = computed(() => {
  const value = route.meta.serviceSettings === true ? route.meta.service : undefined;
  return typeof value === 'string' && isAdministered(value) ? value : null;
});
const slug = computed(() => String(route.params.slug ?? ''));
// Page ou section des paramètres affichée : complète le titre sur mobile.
const settingsPageLabel = computed(() => {
  if (route.name === 'settings') return t(settingsSectionLabelKey(route.hash));
  if (settingsService.value === null) return null;
  const page = serviceSettingsLink(settingsService.value, slug.value, route.name);
  return page ? t(page.labelKey) : null;
});
// Vue d'un service à plusieurs pages (barre basse) : page affichée, d'après
// l'onglet actif sur sa propre page, sinon d'après le titre de la route
// (fiche, page d'usage de l'onglet « Serveur »…).
const servicePageLabel = computed(() => {
  // Pages de l'accueil : leur propre titre (Découverte n'est pas « TMDB · … »).
  if (service.value === null || route.meta.serviceSettings === true || isHomeRoute(route))
    return null;
  const active = bottomNav.value.find((item) => bottomNavActive(item, route));
  if (active === undefined) return null;
  return route.name === active.to.name ? t(active.labelKey) : routeTitle.value || null;
});
const pageLabel = computed(() => settingsPageLabel.value ?? servicePageLabel.value);
// Un seul titre par écran (E5) : celui de l'en-tête de la page s'il y en a un,
// affiché dans la barre sur mobile, laissé à la page sur grand écran. Sur
// mobile, il nomme aussi la page : « Sonarr · Films », « Sonarr · Tâches »,
// « Paramètres · Sauvegarde ».
const title = computed(() => {
  if (!smAndDown.value) return pageHeader.owner === 0 ? routeTitle.value : '';
  const base =
    servicePageLabel.value !== null && service.value !== null
      ? SERVICE_SETTINGS[service.value].label
      : pageHeader.owner !== 0
        ? pageHeader.title
        : routeTitle.value;
  return pageLabel.value && pageLabel.value !== base ? `${base} · ${pageLabel.value}` : base;
});
// Sous-titre qui répète la page déjà nommée par le titre : omis.
const subtitle = computed(() =>
  pageHeader.owner !== 0 && smAndDown.value && pageHeader.subtitle !== pageLabel.value
    ? pageHeader.subtitle
    : null,
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
const bottomNav = computed<BottomNavItem[]>(() =>
  settingsService.value === null
    ? visibleBottomNav(
        route.matched.flatMap((record) => record.meta.bottomNav ?? []),
        { services: session.services, isAdmin: session.isAdmin },
      )
    : serviceSettingsBottomNav(settingsService.value, slug.value),
);
const homeTabs = computed(() => (isHomeRoute(route) ? bottomNav.value : []));

// Habillage mobile des vues de service (D138).
const mobileService = computed(
  () =>
    smAndDown.value && route.matched.some((r) => Boolean(r.meta.service ?? r.meta.serviceParam)),
);
const selection = computed(() => (smAndDown.value ? chrome.selection.value : null));
// Droits sur le service de la page : en lecture seule, ni FAB (ajout, actions
// de la fiche) ni action d'écriture ; une pastille le signale dans la barre.
const routeService = computed(() => serviceOfRoute(route));
const routeAccess = useServiceAccess(routeService, () =>
  typeof route.params.slug === 'string' ? route.params.slug : null,
);
const readOnly = computed(
  () => routeService.value !== null && routeAccess.canRead.value && !routeAccess.canWrite.value,
);
watch(readOnly, (value) => (pageReadOnly.value = value), { immediate: true });
// FAB : celui de la page (speed-dial des fiches…), sinon celui de la route,
// qui mène à la page d'index du service avec `?action=` (`useFabQueryAction`).
const fab = computed<FabSpec | null>(() => {
  if (!smAndDown.value || readOnly.value) return null;
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
  <div
    v-if="refreshing"
    class="restore-indicator"
    role="status"
    :aria-label="t('common.labels.refreshing_cache')"
    :title="t('common.labels.refreshing_cache')"
    data-test="cache-refreshing"
  >
    <v-progress-linear indeterminate color="primary" height="2" />
  </div>
  <NavDrawer v-model="drawer" :permanent="lgAndUp" />
  <AppTopBar
    :title="title"
    :subtitle="subtitle"
    :read-only="readOnly"
    :show-nav-toggle="!lgAndUp"
    :pill="mobileService"
    :search="mobileService ? chrome.search.value : null"
    :selection="selection"
    @toggle-nav="drawer = !drawer"
  />
  <v-main id="main-content" ref="main" tabindex="-1" class="main-content">
    <HomeTabs v-if="!smAndDown && homeTabs.length > 0" :items="homeTabs" />
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
.restore-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2001;
  pointer-events: none;
}
.main-content:focus {
  outline: none;
}
</style>
