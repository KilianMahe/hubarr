<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Corps de la fiche TMDB : en-tête (fond, affiche, titre, badges), actions
// (watchlist, ajout ou ouverture dans la bibliothèque, bande-annonce, IMDb),
// synopsis, épisodes, distribution, équipe, saisons, critiques, infos
// rapides, plateformes, collection, titres alternatifs, galerie, similaires.
//
// Écart : la bande-annonce s'ouvre sur YouTube au lieu d'être
// intégrée (la CSP de Hubarr n'autorise aucun cadre tiers).
import type { TmdbCard, TmdbDetail } from '@hubarr/shared';
import { mdiClose, mdiOpenInNew, mdiPlay, mdiPlus, mdiStar, mdiStarOutline } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { openQuickAdd } from '../../app/overlays';
import { useSessionStore } from '../../app/stores/session';
import { libStatusColor } from './discover-api';
import MediaCard from './MediaCard.vue';
import MediaRow from './MediaRow.vue';
import { useWatchlist } from './useWatchlist';
import { mediaDetailLocation } from '../../app/media-links';

const props = defineProps<{ d: TmdbDetail }>();
const emit = defineEmits<{ similar: [card: TmdbCard]; close: [] }>();
const { t, n } = useI18n();
const session = useSessionStore();
const watchlist = useWatchlist();

const inWatchlist = computed(() => watchlist.has(props.d.type, props.d.id));
const statusKey = (status: string | null) =>
  status ? `decouverte.modal.tmdb_status.${status.toLowerCase().replace(/\s+/g, '_')}` : null;
const minutes = (value: number | null) =>
  value ? t('dashboard.quicklook.runtime', { min: value }) : null;
const money = (value: number | null) =>
  value ? n(value, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : null;
const libraryLocation = computed(() => {
  const value = props.d;
  if (!value.inLibrary || value.libSlug === null || value.libId === null) return null;
  return mediaDetailLocation(value.type === 'tv' ? 'sonarr' : 'radarr', value.libSlug, value.libId);
});
const quickInfo = computed(() => {
  const value = props.d;
  const status = statusKey(value.status);
  return [
    ['decouverte.modal.qi.release', value.release],
    value.type === 'movie'
      ? ['decouverte.modal.qi.runtime', minutes(value.runtime)]
      : ['decouverte.modal.qi.episode_runtime', minutes(value.episodeRuntime)],
    ['decouverte.modal.qi.status', status ? t(status) : null],
    ['decouverte.modal.qi.certification', value.certification],
    ['decouverte.modal.qi.orig_language', value.originalLanguage?.toUpperCase() ?? null],
    ['decouverte.modal.qi.budget', money(value.budget)],
    ['decouverte.modal.qi.box_office', money(value.revenue)],
    ['decouverte.modal.qi.votes', value.voteCount > 0 ? n(value.voteCount) : null],
  ].filter((row): row is [string, string] => typeof row[1] === 'string' && row[1] !== '');
});
const infoRows = computed(() => {
  const value = props.d;
  return [
    ['decouverte.modal.info_row.director', value.crew.directors.join(', ')],
    ['decouverte.modal.info_row.creators', value.creators.join(', ')],
    ['decouverte.modal.info_row.writers', value.crew.writers.slice(0, 4).join(', ')],
    ['decouverte.modal.info_row.composers', value.crew.composers.join(', ')],
    ['decouverte.modal.info_row.cinematography', value.crew.cinematographers.join(', ')],
    ['decouverte.modal.info_row.network', value.networks.map((x) => x.name).join(', ')],
    ['decouverte.modal.info_row.production', value.companies.map((x) => x.name).join(', ')],
    ['decouverte.modal.info_row.country', value.countries.join(', ')],
    ['decouverte.modal.info_row.languages', value.spokenLanguages.join(', ')],
    ['decouverte.modal.info_row.tags', value.keywords.join(', ')],
  ].filter((row): row is [string, string] => row[1] !== '');
});
const youtube = (key: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
const sxe = (season: number, episode: number) =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

function star(): void {
  const value = props.d;
  watchlist.toggle({
    id: value.id,
    type: value.type,
    title: value.title,
    posterPath: value.posterPath,
    vote: value.vote,
    year: value.year,
  });
}
</script>

<template>
  <div>
    <v-img
      :src="d.backdrop ?? ''"
      height="220"
      cover
      gradient="to bottom, rgba(0,0,0,.1), rgba(0,0,0,.85)"
      class="align-end"
    >
      <v-btn
        :icon="mdiClose"
        variant="text"
        color="white"
        class="detail-close"
        :aria-label="t('decouverte.action.close')"
        @click="emit('close')"
      />
      <div class="d-flex ga-4 pa-4 align-end">
        <v-img
          v-if="d.poster"
          :src="d.poster"
          width="96"
          :aspect-ratio="2 / 3"
          rounded="lg"
          class="flex-grow-0 d-none d-sm-block"
        />
        <div class="text-white">
          <div class="text-headline-small">
            {{ d.title }} <span v-if="d.year" class="text-body-large">({{ d.year }})</span>
          </div>
          <div v-if="d.tagline" class="text-body-medium font-italic">{{ d.tagline }}</div>
          <div class="d-flex flex-wrap ga-1 mt-2">
            <v-chip size="small" variant="flat" color="surface">{{
              t(d.type === 'tv' ? 'decouverte.modal.type_series' : 'decouverte.modal.type_film')
            }}</v-chip>
            <v-chip
              v-if="d.vote"
              size="small"
              variant="flat"
              color="surface"
              :prepend-icon="mdiStar"
              >{{ d.vote }}</v-chip
            >
            <v-chip
              v-if="d.inLibrary"
              size="small"
              variant="flat"
              :color="libStatusColor(d.libStatus)"
              >{{ t(`decouverte.modal.status.${d.libStatus ?? 'downloaded'}`) }}</v-chip
            >
            <v-chip v-if="d.certification" size="small" variant="flat" color="surface">{{
              d.certification
            }}</v-chip>
            <v-chip v-for="g in d.genres" :key="g" size="small" variant="outlined" color="white">{{
              g
            }}</v-chip>
          </div>
        </div>
      </div>
    </v-img>

    <v-card-text>
      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          v-if="watchlist.enabled.value"
          :prepend-icon="inWatchlist ? mdiStar : mdiStarOutline"
          :color="inWatchlist ? 'warning' : undefined"
          variant="tonal"
          data-test="detail-watchlist"
          @click="star"
          >{{
            t(inWatchlist ? 'decouverte.modal.in_watchlist' : 'decouverte.modal.watchlist')
          }}</v-btn
        >
        <v-btn
          v-if="session.isAdmin && !d.inLibrary"
          :prepend-icon="mdiPlus"
          color="primary"
          data-test="detail-add"
          @click="openQuickAdd({ tmdb: { type: d.type, id: d.id } })"
          >{{
            t('decouverte.modal.add_to', { service: d.type === 'tv' ? 'Sonarr' : 'Radarr' })
          }}</v-btn
        >
        <v-btn v-if="session.isAdmin && libraryLocation" :to="libraryLocation" variant="tonal">{{
          t('decouverte.modal.view_in', {
            section: t(
              d.type === 'tv' ? 'decouverte.modal.view_series' : 'decouverte.modal.view_movies',
            ),
          })
        }}</v-btn>
        <v-btn
          v-if="d.trailer"
          :href="youtube(d.trailer.key)"
          target="_blank"
          rel="noopener"
          :prepend-icon="mdiPlay"
          :append-icon="mdiOpenInNew"
          variant="tonal"
          >{{ t('decouverte.modal.trailer') }}</v-btn
        >
        <v-btn
          v-if="d.imdbId"
          :href="`https://www.imdb.com/title/${d.imdbId}/`"
          target="_blank"
          rel="noopener"
          variant="text"
          :append-icon="mdiOpenInNew"
          >IMDb</v-btn
        >
      </div>

      <div class="detail-grid">
        <div>
          <h3 class="text-title-medium mb-1">{{ t('decouverte.modal.synopsis') }}</h3>
          <p class="text-body-medium mb-4">{{ d.overview || '—' }}</p>

          <template v-if="d.nextEpisode || d.lastEpisode">
            <div v-if="d.nextEpisode" class="text-body-medium mb-1">
              <strong>{{ t('decouverte.modal.next_episode') }} :</strong>
              {{ sxe(d.nextEpisode.season, d.nextEpisode.episode) }}
              · {{ d.nextEpisode.name }} · {{ d.nextEpisode.airDate }}
            </div>
            <div v-if="d.lastEpisode" class="text-body-medium mb-4">
              <strong>{{ t('decouverte.modal.last_episode') }} :</strong>
              {{ sxe(d.lastEpisode.season, d.lastEpisode.episode) }}
              · {{ d.lastEpisode.name }} · {{ d.lastEpisode.airDate }}
            </div>
          </template>

          <template v-if="d.cast.length">
            <h3 class="text-title-medium mb-2">{{ t('decouverte.modal.cast') }}</h3>
            <div class="d-flex flex-wrap ga-3 mb-4">
              <div v-for="c in d.cast" :key="c.name" class="text-center" style="width: 76px">
                <v-avatar size="64" color="surface-alt">
                  <v-img v-if="c.profile" :src="c.profile" cover />
                  <span v-else>{{ c.name.charAt(0) }}</span>
                </v-avatar>
                <div class="text-body-small text-truncate">{{ c.name }}</div>
                <div class="text-label-small text-muted text-truncate">{{ c.character }}</div>
              </div>
            </div>
          </template>

          <template v-if="infoRows.length">
            <h3 class="text-title-medium mb-2">{{ t('decouverte.modal.info') }}</h3>
            <v-table density="compact" class="mb-4">
              <tbody>
                <tr v-for="[key, value] in infoRows" :key="key">
                  <th class="text-no-wrap">{{ t(key) }}</th>
                  <td>{{ value }}</td>
                </tr>
              </tbody>
            </v-table>
          </template>

          <template v-if="d.seasonsList.length">
            <h3 class="text-title-medium mb-2">{{ t('decouverte.modal.seasons') }}</h3>
            <v-list density="compact" class="mb-4 bg-transparent">
              <v-list-item
                v-for="s in d.seasonsList"
                :key="s.number"
                :title="s.name || t('decouverte.modal.season_label', { n: s.number })"
                :subtitle="`${s.episodeCount} ${t('decouverte.modal.episode_short')}${s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ''}`"
              >
                <template #prepend>
                  <v-avatar rounded="sm" size="40" color="surface-alt">
                    <v-img v-if="s.poster" :src="s.poster" cover />
                  </v-avatar>
                </template>
              </v-list-item>
            </v-list>
          </template>

          <template v-if="d.reviews.length">
            <h3 class="text-title-medium mb-2">{{ t('decouverte.modal.reviews') }}</h3>
            <v-card
              v-for="r in d.reviews"
              :key="r.author + (r.date ?? '')"
              variant="tonal"
              class="mb-2 pa-3"
            >
              <div class="text-body-medium font-weight-medium">
                {{ r.author }}<span v-if="r.rating"> · {{ r.rating }}/10</span>
              </div>
              <p class="text-body-small review-text">{{ r.content }}</p>
            </v-card>
          </template>
        </div>

        <div>
          <h3 class="text-title-medium mb-2">{{ t('decouverte.modal.quick_info') }}</h3>
          <v-table density="compact" class="mb-4">
            <tbody>
              <tr v-for="[key, value] in quickInfo" :key="key">
                <th class="text-no-wrap">{{ t(key) }}</th>
                <td>{{ value }}</td>
              </tr>
            </tbody>
          </v-table>

          <template v-if="d.providers">
            <h3 class="text-title-medium mb-2">
              {{ t('decouverte.modal.available_on') }} ({{ d.providers.country }})
            </h3>
            <div v-for="kind in ['flatrate', 'rent', 'buy'] as const" :key="kind" class="mb-2">
              <template v-if="d.providers[kind].length">
                <div class="text-label-medium text-muted">
                  {{ t(`decouverte.modal.provider.${kind}`) }}
                </div>
                <div class="d-flex flex-wrap ga-1">
                  <v-chip v-for="p in d.providers[kind]" :key="p.name" size="small">
                    <template v-if="p.logo" #prepend>
                      <v-avatar size="18" class="me-1"><v-img :src="p.logo" /></v-avatar>
                    </template>
                    {{ p.name }}
                  </v-chip>
                </div>
              </template>
            </div>
          </template>

          <template v-if="d.collection">
            <h3 class="text-title-medium mb-2">{{ t('decouverte.modal.part_of') }}</h3>
            <v-card variant="tonal" class="mb-4 pa-2 d-flex ga-2 align-center">
              <v-avatar rounded="sm" size="48"
                ><v-img v-if="d.collection.poster" :src="d.collection.poster" cover
              /></v-avatar>
              <span class="text-body-medium">{{ d.collection.name }}</span>
            </v-card>
          </template>

          <template v-if="d.altTitles.length">
            <h3 class="text-title-medium mb-2">{{ t('decouverte.modal.alt_titles') }}</h3>
            <div v-for="a in d.altTitles" :key="a.country + a.title" class="text-body-small">
              <strong>{{ a.country }}</strong> · {{ a.title }}
            </div>
          </template>
        </div>
      </div>

      <template v-if="d.backdrops.length">
        <h3 class="text-title-medium mb-2 mt-2">{{ t('decouverte.modal.gallery') }}</h3>
        <div class="d-flex ga-2 overflow-x-auto mb-4">
          <a
            v-for="img in d.backdrops"
            :key="img.thumb ?? ''"
            :href="img.full ?? undefined"
            target="_blank"
            rel="noopener"
          >
            <v-img :src="img.thumb ?? ''" width="200" :aspect-ratio="16 / 9" rounded="md" cover />
          </a>
        </div>
      </template>

      <MediaRow v-if="d.similar.length" :title="t('decouverte.modal.similar')">
        <MediaCard
          v-for="card in d.similar"
          :key="`${card.type}-${card.id}`"
          :card="card"
          width="140"
          @open="emit('similar', $event)"
        />
      </MediaRow>
    </v-card-text>
  </div>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}
@media (min-width: 960px) {
  .detail-grid {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
}
.detail-close {
  position: absolute;
  top: 8px;
  right: 8px;
}
.review-text {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}
</style>
