<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Tiroir de navigation : permanent sur grand écran, temporaire sur mobile
// (maquettes P0.11). Sections par famille de services, pied avec paramètres,
// aide, code source et version.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildDrawerSections, healthColor, type DrawerServiceItem } from '../app/drawer';
import { downloadBadges } from '../app/download-watch';
import { useServicesHealth } from '../app/health';
import {
  DOCS_HREF,
  DRAWER_FOOTER,
  docsHref,
  DRAWER_SECTIONS,
  type NavItem,
} from '../app/navigation';
import { useSessionStore } from '../app/stores/session';
import { msLogout, msPlayCircleFill } from './symbols';
import { activitySchema, resolveActivitySource, seerrPendingCountSchema } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { isConfigured, isVisibleInSidebar } from '../app/services';
import { tautulliApi, tracearrApi } from '../features/activity/activity-api';
import { seerrApi } from '../features/seerr/seerr-api';
import { useLiveQuery } from '../app/live';
import ServiceLogo from '../features/settings/ServiceLogo.vue';
import { useRoute, useRouter } from 'vue-router';
import HubarrLogo from './HubarrLogo.vue';
import UserAvatar from './UserAvatar.vue';

const open = defineModel<boolean>({ required: true });
defineProps<{ permanent: boolean }>();
const { t, locale } = useI18n();
const session = useSessionStore();
const router = useRouter();
const route = useRoute();
async function logout(): Promise<void> {
  await session.logout().catch(() => undefined);
  await router.replace({ name: 'login' });
}

const visible = (item: NavItem) => item.requiresAdmin !== true || session.isAdmin;
// Entrée d'un groupe (« Accueil ») : active sur chacune de ses routes.
const activeProps = (item: NavItem) =>
  item.activeRoutes ? { active: item.activeRoutes.has(String(route.name)) } : {};
// Le lien d'aide suit la langue de l'interface.
const footer = computed(() =>
  DRAWER_FOOTER.filter(visible).map((item) =>
    item.href === DOCS_HREF ? { ...item, href: docsHref(locale.value) } : item,
  ),
);
const serviceSections = computed(() => buildDrawerSections(session.services));
const health = useServicesHealth();
const label = (item: DrawerServiceItem) => item.label ?? t(item.labelKey ?? '');
const dot = (item: DrawerServiceItem) => healthColor(health.data.value, item);

// Pastille « en cours de lecture » sous le logo (`#sidebar-plex-pill` d'origine) :
// source d'activité choisie, visible dans le menu ; relue toutes les 30 s.
const pillSource = computed(() => {
  const source = resolveActivitySource(session.preferences.display_activity_source, (id) =>
    isConfigured(session.services, id),
  );
  return source !== null && isVisibleInSidebar(session.services, source) ? source : null;
});
const streamsKey = computed(() => ['drawer', 'streams', pillSource.value] as const);
const streams = useQuery({
  queryKey: streamsKey,
  queryFn: ({ signal }) =>
    pillSource.value === 'tracearr' ? tracearrApi.activity(signal) : tautulliApi.activity(signal),
  enabled: computed(() => pillSource.value !== null && session.user !== null),
  // Poussée par le sujet d'activité de la source, sinon relue toutes les 30 s.
  refetchInterval: useLiveQuery({
    topic: () => (pillSource.value === null ? null : `activity.${pillSource.value}`),
    queryKey: streamsKey,
    mode: 'set',
    map: (data) => activitySchema.parse(data),
    fallbackMs: 30_000,
  }),
  retry: false,
});
// Demandes Seerr en attente (badge du tiroir, `SEERR_POLL` d'origine), droit de lecture sur Seerr.
const seerrEnabled = computed(() => isConfigured(session.services, 'seerr'));
const seerrPending = useQuery({
  queryKey: ['drawer', 'seerr-pending'],
  queryFn: ({ signal }) => seerrApi.pendingCount(signal),
  enabled: seerrEnabled,
  refetchInterval: useLiveQuery({
    topic: () => (seerrEnabled.value ? 'seerr.pending' : null),
    queryKey: ['drawer', 'seerr-pending'],
    mode: 'set',
    map: (data) => seerrPendingCountSchema.parse(data),
    fallbackMs: 60_000,
  }),
  retry: false,
});
const badgeOf = (key: string) =>
  key === 'seerr' ? (seerrPending.data.value?.pending ?? 0) : (downloadBadges[key] ?? 0);

const streamCount = computed(() => {
  const data = streams.data.value;
  if (!data || !data.enabled || !data.configured) return 0;
  return data.streamCount;
});
</script>

<template>
  <v-navigation-drawer
    v-model="open"
    :permanent="permanent"
    :temporary="!permanent"
    color="sidebar"
    width="264"
    data-test="nav-drawer"
  >
    <div class="drawer-brand pa-4">
      <router-link
        :to="{ name: 'home' }"
        :aria-label="t('topbar.brand.home')"
        class="text-decoration-none text-high-emphasis"
      >
        <HubarrLogo />
      </router-link>
      <v-chip
        v-if="streamCount > 0"
        :to="{ name: 'dashboard' }"
        :prepend-icon="msPlayCircleFill"
        color="success"
        size="small"
        variant="tonal"
        class="flex-shrink-0"
        data-test="streaming-pill"
        >{{ streamCount > 99 ? '99+' : streamCount }}</v-chip
      >
    </div>

    <v-list nav density="compact" color="on-service-container" class="drawer-list">
      <template v-for="section in DRAWER_SECTIONS" :key="section.titleKey ?? 'root'">
        <v-list-subheader v-if="section.titleKey">{{ t(section.titleKey) }}</v-list-subheader>
        <v-list-item
          v-for="item in section.items.filter(visible)"
          :key="item.labelKey"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="t(item.labelKey)"
          v-bind="activeProps(item)"
          rounded="xl"
          exact
          :data-drawer-item="item.labelKey"
        />
      </template>
      <template v-for="section in serviceSections" :key="section.titleKey">
        <v-list-subheader>{{ t(section.titleKey) }}</v-list-subheader>
        <template v-for="item in section.items" :key="item.key">
          <v-list-group v-if="item.children" :value="item.key">
            <template #activator="{ props: group }">
              <v-list-item
                v-bind="group"
                :title="label(item)"
                rounded="xl"
                :data-drawer-item="item.key"
              >
                <template #prepend>
                  <ServiceLogo :service="item.service" :size="24" class="me-4" />
                </template>
              </v-list-item>
            </template>
            <v-list-item
              v-for="child in item.children"
              :key="child.key"
              :to="child.to"
              :title="label(child)"
              rounded="xl"
              :data-drawer-item="child.key"
            >
              <template #append>
                <v-badge v-if="dot(child)" dot inline :color="dot(child) ?? undefined" />
              </template>
            </v-list-item>
          </v-list-group>
          <v-list-item
            v-else
            :to="item.to"
            :title="label(item)"
            rounded="xl"
            :data-drawer-item="item.key"
          >
            <template #prepend>
              <ServiceLogo :service="item.service" :size="24" class="me-4" />
            </template>
            <template #append>
              <v-chip
                v-if="badgeOf(item.key) > 0"
                size="x-small"
                color="primary"
                class="me-1"
                :data-test="`drawer-badge-${item.key}`"
                >{{ badgeOf(item.key) > 99 ? '99+' : badgeOf(item.key) }}</v-chip
              >
              <v-badge v-if="dot(item)" dot inline :color="dot(item) ?? undefined" />
            </template>
          </v-list-item>
        </template>
      </template>
    </v-list>

    <template #append>
      <v-divider />
      <!-- Pied (maquette P0, E7) : profil et déconnexion, liens en liste verticale
           (lot 9), version. -->
      <div v-if="session.user" class="drawer-profile">
        <router-link
          :to="{ name: 'profile' }"
          class="drawer-profile__link text-decoration-none text-high-emphasis"
          data-test="drawer-profile"
        >
          <UserAvatar :user="session.user" :size="32" />
          <span class="text-body-medium text-truncate">{{ session.user.displayName }}</span>
        </router-link>
        <v-btn
          :icon="msLogout"
          size="small"
          variant="text"
          :aria-label="t('topbar.profile.logout')"
          :title="t('topbar.profile.logout')"
          data-test="drawer-logout"
          @click="logout"
        />
      </div>
      <v-list
        tag="nav"
        nav
        density="compact"
        color="on-service-container"
        :aria-label="t('sidebar.footer.aria_label')"
        class="drawer-links"
        data-test="drawer-footer"
      >
        <v-list-item
          v-for="item in footer"
          :key="item.labelKey"
          :to="item.to"
          :href="item.href"
          :target="item.href ? '_blank' : undefined"
          :rel="item.href ? 'noopener' : undefined"
          :prepend-icon="item.icon"
          :title="t(item.labelKey)"
          rounded="xl"
          :data-test="`drawer-footer-${item.labelKey}`"
        />
      </v-list>
      <div class="px-4 pb-3 text-label-small text-muted">
        {{ t('footer.version', { version: session.version }) }}
      </div>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.drawer-brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
/* Titres de groupe en capitales (maquette P0, E7). */
.drawer-list :deep(.v-list-subheader) {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.drawer-profile {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 0 16px;
}
.drawer-profile__link {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.drawer-links {
  padding-block: 4px;
  background: transparent;
}
</style>
