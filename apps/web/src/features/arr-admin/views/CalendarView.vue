<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Calendrier de l'instance Sonarr (n° 530) : épisodes des 30 prochains jours,
// groupés par date locale de diffusion, avec la série (lien vers sa fiche),
// l'épisode, l'heure et l'état (fichier présent, suivi). L'original rendait
// cette page avec le gabarit des commandes.
import { calendarEpisodeSchema } from '@hubarr/shared';
import { msCheckCircleFill } from '../../../components/symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { useFormat } from '../../../app/format';
import AdminPage from '../AdminPage.vue';
import { useAdminPage } from '../admin-api';
import { groupByAirDate } from '../admin-format';
import { mediaDetailLocation } from '../../../app/media-links';
import EmptyState from '../../../components/EmptyState.vue';

const { t } = useI18n();
const format = useFormat();
const { ctx, query, feedback, error, title } = useAdminPage(
  'calendar',
  '/calendrier',
  z.array(calendarEpisodeSchema),
);
const days = computed(() => groupByAirDate(query.data.value ?? []));
const pad = (value: number) => String(value).padStart(2, '0');
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="query.data.value?.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <EmptyState v-if="days.length === 0" inline :title="t('media.arr_admin.calendar.empty')" />
    <v-card
      v-for="day in days"
      :key="day.date"
      variant="flat"
      border
      class="mb-3"
      data-test="calendar-day"
    >
      <v-card-title class="text-title-small">{{ format.date(day.date) ?? day.date }}</v-card-title>
      <v-list density="compact">
        <v-list-item
          v-for="episode in day.episodes"
          :key="`${episode.seriesId}-${episode.season}-${episode.episode}`"
          :to="
            episode.seriesId === null
              ? undefined
              : mediaDetailLocation('sonarr', ctx.slug.value, episode.seriesId)
          "
          data-test="calendar-episode"
        >
          <v-list-item-title class="font-weight-medium">{{
            episode.seriesTitle
          }}</v-list-item-title>
          <v-list-item-subtitle
            >S{{ pad(episode.season) }}E{{ pad(episode.episode) }} —
            {{ episode.title }}</v-list-item-subtitle
          >
          <template #append>
            <span class="text-body-small text-muted me-2">{{
              episode.airDateUtc === null ? '' : (format.time(episode.airDateUtc) ?? '')
            }}</span>
            <v-icon v-if="episode.hasFile" :icon="msCheckCircleFill" color="success" size="small" />
            <v-chip v-else-if="!episode.monitored" size="x-small" variant="tonal">{{
              t('media.arr_admin.calendar.unmonitored')
            }}</v-chip>
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </AdminPage>
</template>
