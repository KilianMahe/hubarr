<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Tableau de bord (`dashboard/index.html.twig`, routes n° 31 à 42) : bandeau
// épinglé en haut, puis les sections dans l'ordre et la visibilité choisis
// (`DashboardSections`). Chaque carte se charge seule et se masque sans son
// service ; une carte en panne n'affecte pas les autres.
//
// Mode édition (admins) : réordonner par glisser-déposer (souris ou doigt,
// poignée de la ligne) ou par les boutons Monter/Descendre, masquer une section, enregistrer (paramètres
// d'affichage) ou annuler.
import {
  dashboardSectionLabelKey,
  type DashboardLayout,
  type DashboardSection,
} from '@hubarr/shared';
import { msArrowDownward, msArrowUpward, msDragIndicator, msEdit } from '../../components/symbols';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotifyStore } from '../../app/stores/notify';
import { useSortable } from '../../app/sortable';
import { useSessionStore } from '../../app/stores/session';
import { saveSettings } from '../settings/settings-api';
import ActivityCard from './cards/ActivityCard.vue';
import DisksCard from './cards/DisksCard.vue';
import DownloadsCard from './cards/DownloadsCard.vue';
import EmbyCard from './cards/EmbyCard.vue';
import HealthCard from './cards/HealthCard.vue';
import HeroCard from './cards/HeroCard.vue';
import QueueCard from './cards/QueueCard.vue';
import RecentRow from './cards/RecentRow.vue';
import RequestsCard from './cards/RequestsCard.vue';
import TransmissionCard from './cards/TransmissionCard.vue';
import TrendingRow from './cards/TrendingRow.vue';
import UpcomingCard from './cards/UpcomingCard.vue';
import WatchlistRow from './cards/WatchlistRow.vue';
import { dashboardApi, moveSection } from './dashboard-api';

const { t } = useI18n();
const session = useSessionStore();
const notify = useNotifyStore();
const client = useQueryClient();

const page = useQuery({
  queryKey: ['dashboard', 'page'],
  queryFn: ({ signal }) => dashboardApi.page(signal),
  retry: false,
});

const CARDS: Record<Exclude<DashboardSection, 'watchlist'>, Component> = {
  upcoming: UpcomingCard,
  queue: QueueCard,
  downloads: DownloadsCard,
  disks: DisksCard,
  requests: RequestsCard,
  health: HealthCard,
  plex: ActivityCard,
  emby: EmbyCard,
  transmission: TransmissionCard,
  trending: TrendingRow,
  recent: RecentRow,
};
/** Section présente si son service est utilisable (chaque carte se masque aussi seule). */
function shown(key: DashboardSection): boolean {
  const c = page.data.value?.configured;
  if (c === undefined) return false;
  switch (key) {
    case 'upcoming':
    case 'recent':
      return c.radarr || c.sonarr;
    // Services lisibles par le compte : `configured` est calculé selon ses droits.
    case 'queue':
    case 'disks':
      return c.radarr || c.sonarr;
    case 'downloads':
      return c.downloads;
    case 'requests':
      return c.seerr;
    case 'plex':
      return c.tautulli || c.tracearr;
    case 'emby':
      return c.emby;
    case 'transmission':
      return c.transmission;
    case 'trending':
      return c.tmdb;
    default:
      return true;
  }
}
const visibleSections = computed(() =>
  (page.data.value?.layout ?? []).filter((s) => s.visible && shown(s.key)),
);
const ROWS = new Set<DashboardSection>(['watchlist', 'trending', 'recent']);

// ── Mode édition ────────────────────────────────────────────────────────────
const editing = ref(false);
const draft = ref<DashboardLayout>([]);
function startEdit(): void {
  draft.value = (page.data.value?.layout ?? []).map((s) => ({ ...s }));
  editing.value = true;
}
function move(index: number, delta: -1 | 1): void {
  draft.value = moveSection(draft.value, index, delta);
}
const editor = ref<HTMLElement | null>(null);
const sortable = useSortable(draft, editor);
const save = useMutation({
  mutationFn: () =>
    saveSettings({
      dashboard: {
        order: draft.value.map((s) => s.key),
        hidden: draft.value.filter((s) => !s.visible).map((s) => s.key),
      },
    }),
  onSuccess: () => {
    editing.value = false;
    notify.success('admin.flash.saved');
    void client.invalidateQueries({ queryKey: ['dashboard', 'page'] });
    void client.invalidateQueries({ queryKey: ['admin', 'settings'] });
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});
</script>

<template>
  <v-container fluid class="py-4" data-test="dashboard-view">
    <HeroCard />

    <v-card v-if="editing" rounded="xl" class="mb-6" data-test="layout-editor">
      <div ref="editor">
        <v-list density="comfortable">
          <v-list-item
            v-for="(section, index) in draft"
            :key="section.key"
            :class="{
              'opacity-50': !section.visible,
              'layout-row--dragging': sortable.dragging.value === index,
            }"
            data-sortable-item
            :data-test="`layout-row-${section.key}`"
          >
            <template #prepend>
              <v-icon
                :icon="msDragIndicator"
                class="drag-handle"
                :aria-label="t('admin.display.dashboard_layout.drag')"
                data-test="layout-drag"
                v-on="sortable.handle(index)"
              />
            </template>
            <v-list-item-title>{{ t(dashboardSectionLabelKey(section.key)) }}</v-list-item-title>
            <template #append>
              <v-btn
                :icon="msArrowUpward"
                size="small"
                variant="text"
                :disabled="index === 0"
                :aria-label="t('admin.display.dashboard_layout.move_up')"
                @click="move(index, -1)"
              />
              <v-btn
                :icon="msArrowDownward"
                size="small"
                variant="text"
                :disabled="index === draft.length - 1"
                :aria-label="t('admin.display.dashboard_layout.move_down')"
                @click="move(index, 1)"
              />
              <v-switch
                v-model="section.visible"
                density="compact"
                hide-details
                color="primary"
                class="ms-2"
                :aria-label="t('dashboard.layout.hide')"
              />
            </template>
          </v-list-item>
        </v-list>
      </div>
    </v-card>

    <template v-else>
      <v-progress-linear v-if="page.isPending.value" indeterminate color="primary" />
      <div class="dash-grid">
        <div
          v-for="section in visibleSections"
          :key="section.key"
          :class="ROWS.has(section.key) ? 'dash-grid__row' : 'dash-grid__card'"
          :data-section-key="section.key"
        >
          <WatchlistRow
            v-if="section.key === 'watchlist'"
            :items="page.data.value?.watchlist ?? []"
          />
          <component :is="CARDS[section.key]" v-else />
        </div>
      </div>
    </template>
    <!-- « Modifier la disposition » en pied de page (maquette P0, P5b.1 D4) -->
    <div v-if="session.isAdmin" class="d-flex justify-end mt-6 ga-2">
      <template v-if="editing">
        <v-btn variant="text" @click="editing = false">{{ t('dashboard.layout.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :loading="save.isPending.value"
          data-test="layout-save"
          @click="save.mutate()"
          >{{ t('dashboard.layout.save') }}</v-btn
        >
      </template>
      <v-btn
        v-else
        variant="tonal"
        size="small"
        :prepend-icon="msEdit"
        data-test="layout-edit"
        @click="startEdit"
        >{{ t('dashboard.layout.edit') }}</v-btn
      >
    </div>
  </v-container>
</template>

<style scoped>
.dash-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}
.dash-grid__row {
  grid-column: span 12;
}
.dash-grid__card {
  grid-column: span 12;
}
.dash-grid__card:empty,
.dash-grid__row:empty {
  display: none;
}
@media (min-width: 1280px) {
  .dash-grid__card {
    grid-column: span 6;
  }
  .dash-grid__card[data-section-key='upcoming'] {
    grid-column: span 12;
  }
}
.drag-handle {
  cursor: grab;
  /* Le doigt déplace la ligne au lieu de faire défiler la page. */
  touch-action: none;
}
.layout-row--dragging {
  background: rgba(var(--v-theme-primary), 0.12);
  cursor: grabbing;
}
</style>
