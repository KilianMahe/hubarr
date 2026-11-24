<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// En-tête et navigation des pages d'une instance Radarr ou Sonarr
// (`_radarr_nav`, `_sonarr_nav`) : en-tête de service (logo, nom, instance
// avec sélecteur s'il y en a plusieurs, sous-titre et actions de la page,
// P5b.1 F4), puis onglets défilants, sur toutes les tailles, et le menu
// « Plus » des pages d'usage (activité, recherché, découverte, P3b). Les pages
// de configuration et de système s'ouvrent depuis les paramètres de Hubarr
// (P5c.4, D140) : sur ces pages, retour aux paramètres et onglets des
// paramètres du service (groupes, puis pages, P5d.3) remplacent
// onglets et menu. Sur mobile (P5b.4, D138), onglets et menu cèdent la place
// à la barre basse et à l'onglet « Serveur » : il ne reste que le sélecteur
// d'instance et les actions de la page.
import { SERVICE_SETTINGS, type ArrKind } from '@hubarr/shared';
import { msCheck, msDns, msKeyboardArrowDown, msPending } from './symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import type { ArrPage } from '../app/navigation';
import { useSessionStore } from '../app/stores/session';
import { adminMenu } from '../features/arr-admin/admin-pages';
import ServiceHeader from './ds/ServiceHeader.vue';
import ServiceSettingsNav from './ServiceSettingsNav.vue';

const props = defineProps<{
  pages: readonly ArrPage[];
  kind?: ArrKind;
  /** Complément du sous-titre (total de la bibliothèque…), après l'instance. */
  subtitle?: string | null | undefined;
}>();
const { t } = useI18n();
const route = useRoute();
const session = useSessionStore();
const { smAndDown } = useDisplay();
const slug = computed(() => String(route.params.slug ?? ''));
const instances = computed(() =>
  props.kind ? session.services.instances[props.kind].filter((row) => row.enabled) : [],
);
const instance = computed(() => instances.value.find((row) => row.slug === slug.value) ?? null);
const headerSubtitle = computed(
  () => [instance.value?.name, props.subtitle].filter((part) => part).join(' · ') || null,
);
const menu = computed(() => (props.kind ? adminMenu(props.kind, 'service') : []));
const settingsPage = computed(() => route.meta.serviceSettings === true);
const adminActive = computed(() => typeof route.meta.adminPage === 'string');
const activeTab = computed(() =>
  props.pages.some((page) => page.name === route.name) ? route.name : null,
);
</script>

<template>
  <div>
    <ServiceHeader
      v-if="kind"
      :service="kind"
      :title="SERVICE_SETTINGS[kind].label"
      :subtitle="headerSubtitle"
    >
      <!-- Slot conditionnel : sur mobile, l'en-tête n'a pas d'actions et disparaît. -->
      <template v-if="!smAndDown" #default>
        <v-menu v-if="instances.length > 1" location="bottom end">
          <template #activator="{ props: activator }">
            <v-btn
              v-bind="activator"
              :prepend-icon="msDns"
              :append-icon="msKeyboardArrowDown"
              variant="tonal"
              size="small"
              data-test="arr-instance-menu"
              >{{ instance?.name ?? slug }}</v-btn
            >
          </template>
          <v-list density="compact" nav>
            <v-list-item
              v-for="row in instances"
              :key="row.slug"
              :to="{ name: route.name ?? undefined, params: { ...route.params, slug: row.slug } }"
              :title="row.name"
              :active="row.slug === slug"
              color="service-text"
            >
              <template v-if="row.slug === slug" #append>
                <v-icon :icon="msCheck" size="18" />
              </template>
            </v-list-item>
          </v-list>
        </v-menu>
        <slot />
      </template>
    </ServiceHeader>
    <ServiceSettingsNav v-if="settingsPage" />
    <div v-else-if="!smAndDown" class="arr-nav d-flex align-center mb-3">
      <v-tabs
        :model-value="activeTab"
        color="service-text"
        density="compact"
        show-arrows
        class="arr-nav__tabs"
      >
        <v-tab
          v-for="page in pages"
          :key="page.name"
          :value="page.name"
          :to="{ name: page.name, params: { slug } }"
          :prepend-icon="page.icon"
          >{{ t(page.labelKey) }}</v-tab
        >
      </v-tabs>
      <v-menu v-if="menu.length > 0" location="bottom end" max-height="70vh">
        <template #activator="{ props: activator }">
          <v-btn
            v-bind="activator"
            :prepend-icon="msPending"
            :append-icon="msKeyboardArrowDown"
            :variant="adminActive ? 'tonal' : 'text'"
            :color="adminActive ? 'service-text' : undefined"
            size="small"
            class="ms-1 flex-shrink-0"
            data-test="arr-admin-menu"
            >{{ t('media.group.more') }}</v-btn
          >
        </template>
        <v-list density="compact" nav min-width="240">
          <template v-for="(group, index) in menu" :key="group.group">
            <v-divider v-if="index > 0" class="my-1" />
            <v-list-subheader>{{ t(group.labelKey) }}</v-list-subheader>
            <v-list-item
              v-for="item in group.pages"
              :key="item.name"
              :to="{ name: item.name, params: { slug } }"
              :prepend-icon="item.icon"
              :title="t(item.labelKey)"
              :active="route.name === item.name"
              color="service-text"
              :data-test="`arr-admin-link-${item.name}`"
            />
          </template>
        </v-list>
      </v-menu>
    </div>
    <!-- Mobile : sélecteur d'instance et actions de la page sur une ligne -->
    <div
      v-if="smAndDown && (instances.length > 1 || $slots.default)"
      class="d-flex align-center justify-end ga-1 mb-2"
      data-test="arr-nav-mobile"
    >
      <v-menu v-if="instances.length > 1" location="bottom end">
        <template #activator="{ props: activator }">
          <v-btn
            v-bind="activator"
            :icon="msDns"
            variant="text"
            size="small"
            :aria-label="instance?.name ?? slug"
            :title="instance?.name ?? slug"
            data-test="arr-instance-menu"
          />
        </template>
        <v-list density="compact" nav>
          <v-list-item
            v-for="row in instances"
            :key="row.slug"
            :to="{ name: route.name ?? undefined, params: { ...route.params, slug: row.slug } }"
            :title="row.name"
            :active="row.slug === slug"
            color="service-text"
          >
            <template v-if="row.slug === slug" #append>
              <v-icon :icon="msCheck" size="18" />
            </template>
          </v-list-item>
        </v-list>
      </v-menu>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.arr-nav {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.arr-nav__tabs {
  min-width: 0;
  flex: 1 1 auto;
}
</style>
