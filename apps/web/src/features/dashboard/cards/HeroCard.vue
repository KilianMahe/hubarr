<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Bandeau (`_hero.html.twig`) : salutation et horloge affichées aussitôt, puis
// mise en avant (film de la bibliothèque avec fanart, sinon tendance TMDB) et
// statistiques (films, séries, sorties à 7 jours) chargées à part, en tuiles
// sous le bandeau.
import { dayInZone, hourInZone } from '@hubarr/shared';
import { msCalendarToday, msMovie, msStarFill, msTv } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useFormat } from '../../../app/format';
import StatTile from '../../../components/ds/StatTile.vue';
import { openQuickLook } from '../../../app/overlays';
import { useSessionStore } from '../../../app/stores/session';
import { dashboardApi, greetingKey, weekdayKey } from '../dashboard-api';

const { t } = useI18n();
const format = useFormat();
const session = useSessionStore();
const now = ref(new Date());
const clock = setInterval(() => (now.value = new Date()), 30_000);
onBeforeUnmount(() => {
  clearInterval(clock);
});

const tz = computed(() => session.preferences.display_timezone);
const greeting = computed(() => t(greetingKey(hourInZone(now.value, tz.value) ?? 12)));
const weekday = computed(() => t(weekdayKey(dayInZone(now.value, tz.value) ?? '2026-01-05')));
// Mise en avant tirée au hasard par le serveur : relue à chaque visite du
// tableau de bord, mais plus au retour sur l'onglet ni toutes les 45 s, ce qui
// changeait l'image de fond (et la redécodait) sous les yeux (P5d.1, V22).
const hero = useQuery({
  queryKey: ['dashboard', 'hero'],
  queryFn: ({ signal }) => dashboardApi.hero(signal),
  staleTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  retry: false,
});
const spot = computed(() => hero.data.value?.spotlight ?? null);
// Desktop (P5c.3, V1) : bandeau limité en hauteur, contenu resserré.
const { mdAndUp } = useDisplay();
const stats = computed(() => [
  { icon: msMovie, value: hero.data.value?.stats.films, key: 'dashboard.hero.stats.films' },
  {
    icon: msTv,
    value: hero.data.value?.stats.series,
    key: 'dashboard.hero.stats.series',
  },
  {
    icon: msCalendarToday,
    value: hero.data.value?.upcomingCount,
    key: 'dashboard.hero.stats.upcoming_7d',
  },
]);
</script>

<template>
  <div class="mb-6" data-test="dashboard-hero">
    <v-card rounded="xl" class="hero" :class="{ 'hero--compact': mdAndUp }">
      <v-img
        :src="spot?.url ?? ''"
        cover
        :min-height="mdAndUp ? 160 : 180"
        :max-height="mdAndUp ? 280 : undefined"
        gradient="to right, rgba(0,0,0,.85), rgba(0,0,0,.35)"
        class="text-white"
      >
        <div class="hero-body d-flex flex-column h-100">
          <div>
            <div class="text-label-large">
              {{ weekday }} · {{ format.date(now) }} · {{ format.time(now) }}
            </div>
            <h1 :class="mdAndUp ? 'text-headline-small' : 'text-headline-medium'">
              {{ greeting }}, {{ session.user?.displayName }}
            </h1>
          </div>
          <div v-if="spot" class="hero-spot">
            <div class="hero-spot__title">
              <v-chip size="small" variant="flat" color="primary">{{
                t(`dashboard.hero_badge.${spot.badge}`)
              }}</v-chip>
              <div class="text-title-large">{{ spot.title }}</div>
            </div>
            <div class="d-flex flex-wrap ga-2 text-body-small align-center">
              <span v-if="spot.rating"
                ><v-icon :icon="msStarFill" size="14" />
                {{ Math.round(spot.rating * 10) / 10 }}/10</span
              >
              <span v-if="spot.year">{{ spot.year }}</span>
              <span v-if="spot.runtime">{{
                t('dashboard.quicklook.runtime', { min: spot.runtime })
              }}</span>
              <v-chip v-if="spot.quality" size="x-small" variant="outlined">{{
                spot.quality
              }}</v-chip>
              <v-chip v-for="g in spot.genres" :key="g" size="x-small" variant="outlined">{{
                g
              }}</v-chip>
            </div>
            <p v-if="spot.overview" class="text-body-medium mt-1 hero-overview">
              {{ spot.overview }}
            </p>
            <v-btn
              v-if="spot.ref"
              variant="flat"
              color="surface"
              size="small"
              class="mt-1"
              data-test="hero-cta"
              @click="openQuickLook(spot.ref)"
              >{{
                t(
                  spot.source === 'library'
                    ? 'dashboard.hero_badge.cta_view'
                    : 'dashboard.hero_badge.cta_discover',
                )
              }}</v-btn
            >
          </div>
        </div>
      </v-img>
    </v-card>
    <!-- Statistiques sous le bandeau (maquette P0, P5b.1 D1) -->
    <div class="hero-stats mt-3">
      <StatTile
        v-for="s in stats"
        :key="s.key"
        :icon="s.icon"
        :value="hero.isPending.value ? '…' : (s.value ?? '—')"
        :label="t(s.key)"
        data-test="hero-stat"
      />
    </div>
  </div>
</template>

<style scoped>
.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.hero-body {
  padding: 24px;
  gap: 12px;
}
.hero-spot {
  max-width: 640px;
}
.hero-spot__title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
/* Desktop (V1) : badge et titre sur une ligne, marges et résumé réduits. */
.hero--compact .hero-body {
  padding: 20px 24px;
  gap: 8px;
}
.hero--compact .hero-spot__title {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.hero--compact .hero-overview {
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.hero-overview {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
