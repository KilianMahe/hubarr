<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Onglet « Prochains épisodes » d'une instance Sonarr (P5c.6, V17, MEMOIRE
// D143), sorti de la bibliothèque : 14 jours à partir d'aujourd'hui, un bloc
// par jour ; série, épisode, heure (préférences d'affichage), état
// (disponible, manquant si déjà diffusé, à venir). Une ligne ouvre la fiche.
import { dayInZone, type CalendarEvent } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useFormat } from '../../app/format';
import { mediaDetailLocation } from '../../app/media-links';
import { useSessionStore } from '../../app/stores/session';
import EmptyState from '../../components/EmptyState.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { calendarApi } from '../calendar/calendar-api';
import { useRoutePage } from '../movies/useRoutePage';
import SonarrNav from './SonarrNav.vue';
import { episodeCode } from './library';
import { UPCOMING_DAYS, upcomingDays, upcomingStatus, type UpcomingStatus } from './upcoming';

const { t } = useI18n();
const format = useFormat();
const router = useRouter();
const session = useSessionStore();
const { slug } = useRoutePage();

const calendar = useQuery({
  queryKey: ['calendar'],
  queryFn: ({ signal }) => calendarApi.events(signal),
  staleTime: 60_000,
  retry: false,
});
const today = computed(
  () =>
    dayInZone(new Date(), session.preferences.display_timezone) ??
    new Date().toISOString().slice(0, 10),
);
const days = computed(() =>
  upcomingDays(calendar.data.value?.events ?? [], slug.value, today.value),
);
const now = Date.now();

const STATUS_COLORS: Record<UpcomingStatus, string> = {
  available: 'success',
  missing: 'warning',
  upcoming: 'muted',
};

function dayLabel(day: string): string {
  const tomorrow = new Date(`${today.value}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (day === today.value) return t('media.upcoming.today');
  if (day === tomorrow.toISOString().slice(0, 10)) return t('media.upcoming.tomorrow');
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return `${t(`calendar.weekdays.full.${dow}`)} · ${format.date(`${day}T12:00:00Z`)}`;
}

function open(episode: CalendarEvent): void {
  if (episode.id !== null) void router.push(mediaDetailLocation('sonarr', slug.value, episode.id));
}
</script>

<template>
  <v-container fluid class="sonarr-page" data-test="sonarr-upcoming-page">
    <ServiceDownBanner service="sonarr" :instance="slug" />
    <SonarrNav />
    <h2 class="text-title-medium mb-2">{{ t('media.upcoming.title') }}</h2>
    <v-progress-linear v-if="calendar.isPending.value" indeterminate color="service" />
    <EmptyState
      v-else-if="days.length === 0"
      :title="t('media.upcoming.empty', { days: UPCOMING_DAYS })"
    />
    <section v-for="group in days" :key="group.day" class="mb-4" data-test="upcoming-day">
      <h3 class="text-title-small mb-2" :class="{ 'text-service-text': group.day === today }">
        {{ dayLabel(group.day) }}
      </h3>
      <v-card variant="flat" border>
        <v-list lines="two" class="py-0">
          <v-list-item
            v-for="episode in group.episodes"
            :key="`${episode.id}-${episode.season}-${episode.episode}`"
            :disabled="episode.id === null"
            data-test="upcoming-episode"
            @click="open(episode)"
          >
            <template #prepend>
              <v-avatar rounded="sm" size="44" color="surface-alt" class="me-3">
                <v-img v-if="episode.poster" :src="episode.poster" cover />
              </v-avatar>
            </template>
            <v-list-item-title class="font-weight-medium">{{
              episode.seriesTitle
            }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ episodeCode(episode.season ?? 0, episode.episode ?? 0) }}
              <template v-if="episode.title"> · {{ episode.title }}</template>
            </v-list-item-subtitle>
            <template #append>
              <div class="d-flex flex-column align-end ga-1">
                <span v-if="episode.airDateUtc" class="text-body-small text-muted">{{
                  format.time(episode.airDateUtc)
                }}</span>
                <v-chip
                  size="x-small"
                  label
                  variant="tonal"
                  :color="STATUS_COLORS[upcomingStatus(episode, now)]"
                  >{{ t(`media.series.calendar.${upcomingStatus(episode, now)}`) }}</v-chip
                >
              </div>
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </section>
  </v-container>
</template>
