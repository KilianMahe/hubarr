<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Prochaines sorties sur 7 jours (`_upcoming.html.twig`) : grille fixe de
// 7 jours, 3 éléments par jour puis « + n » vers le calendrier ; un élément
// ouvre l'aperçu rapide de sa bibliothèque.
import type { UpcomingItem } from '@hubarr/shared';
import { mdiCalendar, mdiMovieOpen, mdiTelevisionClassic } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../../app/format';
import { openQuickLook } from '../../../app/overlays';
import { dashboardApi, upcomingByDay, weekdayKey } from '../dashboard-api';
import DashCard from './DashCard.vue';

const { t } = useI18n();
const format = useFormat();
const MAX_SHOWN = 3;
const query = useQuery({
  queryKey: ['dashboard', 'upcoming'],
  queryFn: ({ signal }) => dashboardApi.upcoming(signal),
  staleTime: 45_000,
  retry: false,
});
const days = computed(() => {
  const data = query.data.value;
  return data ? upcomingByDay(data.today, data.days, data.items) : [];
});
const meta = (item: UpcomingItem) =>
  [
    item.at ? format.time(item.at) : null,
    item.type === 'episode' ? item.episodeCode : null,
    item.releaseKind ? t(`dashboard.release_badge.${item.releaseKind}`) : item.network,
  ]
    .filter(Boolean)
    .join(' · ');
function open(item: UpcomingItem): void {
  if (item.id === null) return;
  openQuickLook({
    kind: 'library',
    type: item.type === 'movie' ? 'movie' : 'series',
    slug: item.slug,
    id: item.id,
  });
}
</script>

<template>
  <DashCard
    v-if="query.data.value?.available !== false"
    :title="t('dashboard.upcoming.title')"
    :icon="mdiCalendar"
    :to="{ name: 'calendar' }"
    :link-label="t('dashboard.upcoming.calendar_cta')"
    :loading="query.isFetching.value"
    data-test="card-upcoming"
  >
    <p
      v-if="query.data.value && query.data.value.items.length === 0"
      class="text-body-medium text-muted text-center py-4"
    >
      {{ t('dashboard.upcoming.empty') }}
    </p>
    <div v-else class="mini-cal">
      <div
        v-for="day in days"
        :key="day.day"
        class="mini-cal__day"
        :class="{ 'mini-cal__day--today': day.isToday }"
      >
        <div class="text-label-small text-uppercase">{{ t(weekdayKey(day.day)).slice(0, 3) }}</div>
        <div class="text-title-medium mb-1">{{ day.dayOfMonth }}</div>
        <div v-if="day.items.length === 0" class="text-muted">—</div>
        <button
          v-for="item in day.items.slice(0, MAX_SHOWN)"
          :key="`${item.type}-${item.id}-${item.episodeCode}`"
          type="button"
          class="mini-cal__item text-start"
          :title="item.title"
          @click="open(item)"
        >
          <v-avatar rounded="sm" size="36" color="surface-alt" class="flex-shrink-0">
            <v-img v-if="item.poster" :src="item.poster" cover />
            <v-icon
              v-else
              :icon="item.type === 'movie' ? mdiMovieOpen : mdiTelevisionClassic"
              size="18"
            />
          </v-avatar>
          <span class="overflow-hidden">
            <span class="d-block text-body-small text-truncate font-weight-medium">{{
              item.title
            }}</span>
            <span class="d-block text-label-small text-muted text-truncate">{{ meta(item) }}</span>
          </span>
        </button>
        <v-btn
          v-if="day.items.length > MAX_SHOWN"
          :to="{ name: 'calendar', query: { view: 'day', date: day.day } }"
          variant="text"
          size="x-small"
          >{{ t('dashboard.upcoming.more', { count: day.items.length - MAX_SHOWN }) }}</v-btn
        >
      </div>
    </div>
  </DashCard>
</template>

<style scoped>
.mini-cal {
  display: grid;
  grid-template-columns: repeat(7, minmax(110px, 1fr));
  gap: 8px;
  overflow-x: auto;
}
.mini-cal__day {
  border-radius: 12px;
  padding: 8px;
  background: rgb(var(--v-theme-surface-alt));
}
.mini-cal__day--today {
  outline: 2px solid rgb(var(--v-theme-primary));
}
.mini-cal__item {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  padding: 4px 0;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
}
</style>
