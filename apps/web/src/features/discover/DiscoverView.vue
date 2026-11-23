<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Page Découverte (`decouverte/index.html.twig`, routes n° 550 à 558).
//
// - Recherche (`/decouverte/recherche`) : requête différée de 300 ms, type,
//   genre, note minimale, tri, « masquer ce que j'ai » ; meilleur résultat,
//   personne la plus connue, personnes, grille, « vouliez-vous dire » et
//   correction automatique (lien « chercher plutôt » pour la requête exacte) ;
//   sans requête mais avec des filtres : exploration paginée (« Charger plus »).
//   Touche « / » : focus sur la recherche.
// - Accueil : titres tendance (film et série), « Pour vous » d'après la
//   bibliothèque, consultés récemment (navigateur), sections TMDB.
// - Fiche par `?detail=movie/603`, filmographie d'une personne.
import type { SearchPerson, SmartSearch, TmdbCard } from '@hubarr/shared';
import { mdiCompassOutline, mdiMagnify, mdiStar } from '@mdi/js';
import { useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EmptyState from '../../components/EmptyState.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { RECENT_KEY, RECENT_MAX, discoverApi, type SmartSearchParams } from './discover-api';
import MediaCard from './MediaCard.vue';
import MediaRow from './MediaRow.vue';
import PersonSheet from './PersonSheet.vue';
import TmdbDetailDialog from './TmdbDetailDialog.vue';
import { useRouteDetail } from './useRouteDetail';

const { t } = useI18n();
const detail = useRouteDetail();
const openCard = (card: TmdbCard) => {
  detail.value = { type: card.type, id: card.id };
};

// ── Accueil ─────────────────────────────────────────────────────────────────
const home = useQuery({
  queryKey: ['discover', 'home'],
  queryFn: ({ signal }) => discoverApi.home(signal),
  staleTime: 300_000,
  retry: false,
});
const recs = useQuery({
  queryKey: ['discover', 'my-recs'],
  queryFn: ({ signal }) => discoverApi.myRecommendations(signal),
  staleTime: 600_000,
  retry: false,
});
const recsTab = ref<'results' | 'movies' | 'tv'>('results');
const recsCards = computed(() => recs.data.value?.[recsTab.value] ?? []);
const SECTIONS = [
  ['trending', 'decouverte.section.trending'],
  ['popMovies', 'decouverte.section.popular_movies'],
  ['popTv', 'decouverte.section.popular_tv'],
  ['upcoming', 'decouverte.section.upcoming'],
  ['onAir', 'decouverte.section.on_air'],
  ['topMovies', 'decouverte.section.top_movies'],
  ['topTv', 'decouverte.section.top_tv'],
] as const;

// ── Consultés récemment ─────────────────────────────────────────────────────
function loadRecent(): TmdbCard[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as TmdbCard[]) : [];
  } catch {
    return [];
  }
}
const recent = ref<TmdbCard[]>(loadRecent());
function pushRecent(card: TmdbCard): void {
  const list = [card, ...recent.value.filter((r) => !(r.id === card.id && r.type === card.type))];
  recent.value = list.slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
}
function clearRecent(): void {
  recent.value = [];
  localStorage.removeItem(RECENT_KEY);
}

// ── Recherche ───────────────────────────────────────────────────────────────
interface SearchState {
  q: string | null;
  type: 'all' | 'movie' | 'tv';
  genre: number;
  vote: number;
  sort: NonNullable<SmartSearchParams['sort']>;
  hideOwned: boolean;
  exact: boolean;
}
const search = reactive<SearchState>({
  q: '',
  type: 'all',
  genre: 0,
  vote: 0,
  sort: 'relevance',
  hideOwned: false,
  exact: false,
});
const filtersActive = computed(
  () => search.type !== 'all' || search.genre > 0 || search.vote > 0 || search.hideOwned,
);
const active = computed(() => (search.q ?? '').trim().length >= 2 || filtersActive.value);
const result = ref<SmartSearch | null>(null);
const page = ref(1);
const searching = ref(false);
const searchError = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | null = null;

async function run(append = false): Promise<void> {
  clearTimeout(timer);
  controller?.abort();
  if (!active.value) {
    result.value = null;
    return;
  }
  controller = new AbortController();
  const signal = controller.signal;
  page.value = append ? page.value + 1 : 1;
  searching.value = true;
  searchError.value = false;
  try {
    const data = await discoverApi.smartSearch(
      {
        q: (search.q ?? '').trim(),
        type: search.type,
        sort: search.sort,
        genre: search.genre || undefined,
        vote_min: search.vote || undefined,
        hide_owned: search.hideOwned,
        exact: search.exact,
        page: page.value,
      },
      signal,
    );
    if (append && result.value) {
      result.value = { ...data, results: [...result.value.results, ...data.results] };
    } else result.value = data;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) searchError.value = true;
  } finally {
    if (!signal.aborted) searching.value = false;
  }
}
function schedule(): void {
  clearTimeout(timer);
  search.exact = false;
  timer = setTimeout(() => void run(), 300);
}
watch(
  () => [search.type, search.genre, search.vote, search.sort, search.hideOwned],
  () => void run(),
);
function reset(): void {
  Object.assign(search, {
    q: '',
    type: 'all',
    genre: 0,
    vote: 0,
    sort: 'relevance',
    hideOwned: false,
    exact: false,
  });
  result.value = null;
}
function applySuggestion(text: string): void {
  search.q = text;
  void run();
}
function searchExactly(text: string): void {
  search.q = text;
  search.exact = true;
  void run();
}
const moreAvailable = computed(
  () =>
    result.value?.mode === 'discover' && (result.value.page ?? 1) < (result.value.totalPages ?? 1),
);

// Genres des deux types (fusionnés, triés).
const genres = useQuery({
  queryKey: computed(() => ['discover', 'genres', search.type] as const),
  queryFn: async ({ signal }) => {
    const types = search.type === 'all' ? (['movie', 'tv'] as const) : [search.type];
    const lists = await Promise.all(types.map((type) => discoverApi.genres(type, signal)));
    const seen = new Map<number, string>();
    for (const list of lists)
      for (const g of list.genres) if (!seen.has(g.id)) seen.set(g.id, g.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ value: id, title: name }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
  staleTime: 3_600_000,
  retry: false,
});
const genreItems = computed(() => [
  { value: 0, title: t('decouverte.srch.all_genres') },
  ...(genres.data.value ?? []),
]);
const voteItems = computed(() => [
  { value: 0, title: t('decouverte.srch.any_rating') },
  ...[5, 6, 7, 8].map((v) => ({ value: v, title: `≥ ${v}` })),
]);
const sortItems = computed(() =>
  (['relevance', 'popularity', 'vote', 'newest'] as const).map((value) => ({
    value,
    title: t(`decouverte.srch.sort.${value}`),
  })),
);

const person = ref<SearchPerson | null>(null);
const personId = computed({
  get: () => person.value?.id ?? null,
  set: (value) => {
    if (value === null) person.value = null;
  },
});

// « / » : focus sur la recherche (hors champ de saisie).
const input = ref<{ focus: () => void } | null>(null);
function onKey(event: KeyboardEvent): void {
  const tag = (event.target as HTMLElement | null)?.tagName ?? '';
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
    event.preventDefault();
    input.value?.focus();
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  clearTimeout(timer);
  controller?.abort();
});
const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2);
</script>

<template>
  <v-container fluid class="py-4" data-test="discover-view">
    <ServiceDownBanner service="tmdb" />

    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <v-filter-field
        ref="input"
        v-model="search.q"
        :placeholder="t('decouverte.srch.placeholder')"
        :prepend-inner-icon="mdiMagnify"
        :hint="t('decouverte.srch.shortcut')"
        variant="solo-filled"
        flat
        clearable
        hide-details
        density="comfortable"
        class="flex-grow-1"
        style="min-width: 240px"
        data-test="discover-search"
        @update:model-value="schedule"
        @keydown.enter="run()"
      />
      <v-btn :to="{ name: 'tmdb-watchlist' }" variant="tonal" :prepend-icon="mdiStar">{{
        t('decouverte.actions.watchlist')
      }}</v-btn>
      <v-btn :to="{ name: 'tmdb-explorer' }" variant="tonal" :prepend-icon="mdiCompassOutline">{{
        t('decouverte.actions.explorer')
      }}</v-btn>
    </div>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn-toggle v-model="search.type" mandatory density="compact" variant="outlined" divided>
        <v-btn value="all">{{ t('decouverte.filters.all') }}</v-btn>
        <v-btn value="movie">{{ t('decouverte.filters.movies') }}</v-btn>
        <v-btn value="tv">{{ t('decouverte.filters.series') }}</v-btn>
      </v-btn-toggle>
      <v-filter-select
        v-model="search.genre"
        :items="genreItems"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 200px"
        :label="t('decouverte.filters.genre')"
      />
      <v-filter-select
        v-model="search.vote"
        :items="voteItems"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 160px"
        :label="t('decouverte.srch.rating')"
      />
      <v-filter-select
        v-model="search.sort"
        :items="sortItems"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 200px"
        :label="t('decouverte.filters.sort')"
      />
      <v-switch
        v-model="search.hideOwned"
        :label="t('decouverte.srch.hide_owned')"
        density="compact"
        hide-details
        color="primary"
      />
      <v-btn v-if="active" variant="text" @click="reset">{{ t('decouverte.filters.reset') }}</v-btn>
    </div>

    <!-- Résultats de la recherche -->
    <template v-if="active">
      <v-progress-linear v-if="searching" indeterminate color="primary" class="mb-2" />
      <v-alert v-if="searchError" type="error" variant="tonal" class="mb-3">{{
        t('decouverte.search.search_error')
      }}</v-alert>
      <template v-if="result">
        <div v-if="result.correctedFrom" class="text-body-medium mb-2" data-test="corrected">
          {{ t('decouverte.srch.showing_for').replace('__S__', result.correctedTo ?? '') }}
          <a href="#" @click.prevent="searchExactly(result.correctedFrom)">{{
            t('decouverte.srch.search_instead').replace('__Q__', result.correctedFrom)
          }}</a>
        </div>
        <div v-else-if="result.suggestion" class="text-body-medium mb-2" data-test="suggestion">
          <a href="#" @click.prevent="applySuggestion(result.suggestion)">{{
            t('decouverte.srch.did_you_mean').replace('__S__', result.suggestion)
          }}</a>
        </div>
        <div v-if="result.mode === 'discover'" class="text-body-small text-muted mb-2">
          {{ t('decouverte.srch.browse') }}
        </div>

        <v-card
          v-if="result.bestPerson"
          variant="tonal"
          class="mb-4 pa-3 d-flex ga-3 align-center"
          data-test="best-person"
          @click="person = result.bestPerson"
        >
          <v-avatar size="72" color="surface-alt">
            <v-img v-if="result.bestPerson.profile" :src="result.bestPerson.profile" cover />
            <span v-else>{{ initials(result.bestPerson.name) }}</span>
          </v-avatar>
          <div>
            <div class="text-label-medium text-muted">{{ t('decouverte.srch.person_kicker') }}</div>
            <div class="text-title-large">{{ result.bestPerson.name }}</div>
            <div class="text-body-small">{{ result.bestPerson.titles.join(' · ') }}</div>
            <v-btn variant="text" size="small" class="px-0">{{
              t('decouverte.srch.see_filmography')
            }}</v-btn>
          </div>
        </v-card>

        <v-card
          v-if="result.best"
          variant="tonal"
          class="mb-4 d-flex"
          data-test="best-match"
          @click="openCard(result.best)"
        >
          <v-img
            :src="result.best.poster ?? ''"
            width="120"
            :aspect-ratio="2 / 3"
            cover
            class="flex-grow-0"
          />
          <div class="pa-3">
            <div class="text-label-medium text-muted">{{ t('decouverte.srch.best') }}</div>
            <div class="text-title-large">
              {{ result.best.title
              }}<span v-if="result.best.year" class="text-body-medium">
                ({{ result.best.year }})</span
              >
            </div>
            <div
              v-if="result.best.originalTitle && result.best.originalTitle !== result.best.title"
              class="text-body-small text-muted"
            >
              {{ result.best.originalTitle }}
            </div>
            <div class="d-flex flex-wrap ga-1 my-1">
              <v-chip v-for="g in result.best.genres" :key="g" size="x-small">{{ g }}</v-chip>
            </div>
            <p class="text-body-small best-overview">{{ result.best.overview }}</p>
          </div>
        </v-card>

        <template v-if="result.people.length">
          <h3 class="text-title-medium mb-2">{{ t('decouverte.srch.people') }}</h3>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-chip v-for="p in result.people" :key="p.id" size="large" @click="person = p">
              <template #prepend>
                <v-avatar size="28" color="surface-alt" class="me-2">
                  <v-img v-if="p.profile" :src="p.profile" cover />
                  <span v-else class="text-label-small">{{ initials(p.name) }}</span>
                </v-avatar>
              </template>
              {{ p.name }}
            </v-chip>
          </div>
        </template>

        <h3
          v-if="result.results.length && (result.best || result.bestPerson)"
          class="text-title-medium mb-2"
        >
          {{ t('decouverte.srch.others') }}
        </h3>
        <div class="media-grid" data-test="search-results">
          <MediaCard
            v-for="card in result.results"
            :key="`${card.type}-${card.id}`"
            :card="card"
            @open="openCard"
          />
        </div>
        <EmptyState
          v-if="!searching && result.results.length === 0 && !result.best && !result.bestPerson"
          :icon="mdiMagnify"
          :title="
            t(
              filtersActive
                ? 'decouverte.search.no_filter_results'
                : 'decouverte.search.no_results',
            )
          "
        />
        <div v-if="moreAvailable" class="text-center mt-4">
          <v-btn variant="tonal" :loading="searching" @click="run(true)">{{
            t('decouverte.srch.more')
          }}</v-btn>
        </div>
      </template>
    </template>

    <!-- Accueil -->
    <template v-else>
      <v-alert v-if="home.data.value?.error" type="warning" variant="tonal" class="mb-4">{{
        t('decouverte.search.search_error')
      }}</v-alert>
      <v-row
        v-if="home.data.value && (home.data.value.heroMovie || home.data.value.heroTv)"
        class="mb-2"
      >
        <v-col
          v-for="(hero, i) in [home.data.value.heroMovie, home.data.value.heroTv]"
          :key="i"
          cols="12"
          md="6"
        >
          <v-card v-if="hero" rounded="xl" @click="openCard(hero)">
            <v-img
              :src="hero.backdrop ?? ''"
              height="200"
              cover
              gradient="to bottom, rgba(0,0,0,0), rgba(0,0,0,.85)"
              class="align-end"
            >
              <div class="pa-4 text-white">
                <div class="text-label-medium">
                  {{ t(i === 0 ? 'decouverte.hero.movie' : 'decouverte.hero.tv') }}
                </div>
                <div class="text-headline-small">{{ hero.title }}</div>
                <div class="text-body-small hero-overview">{{ hero.overview }}</div>
              </div>
            </v-img>
          </v-card>
        </v-col>
      </v-row>

      <MediaRow
        v-if="recs.isFetching.value || recsCards.length"
        :title="t('decouverte.section.my_recs.title')"
        :subtitle="t('decouverte.section.my_recs.subtitle')"
        :loading="recs.isFetching.value && !recs.data.value"
      >
        <MediaCard
          v-for="card in recsCards"
          :key="`${card.type}-${card.id}`"
          :card="card"
          width="150"
          @open="openCard"
        />
      </MediaRow>
      <v-btn-toggle
        v-if="recs.data.value?.seeds"
        v-model="recsTab"
        mandatory
        density="compact"
        variant="text"
        class="mt-n4 mb-4"
      >
        <v-btn value="results" size="small">{{ t('decouverte.filters.all') }}</v-btn>
        <v-btn value="movies" size="small">{{ t('decouverte.filters.movies') }}</v-btn>
        <v-btn value="tv" size="small">{{ t('decouverte.filters.series') }}</v-btn>
      </v-btn-toggle>

      <section v-if="recent.length" class="mb-2">
        <MediaRow :title="t('decouverte.recent.title')">
          <MediaCard
            v-for="card in recent"
            :key="`${card.type}-${card.id}`"
            :card="card"
            width="150"
            @open="openCard"
          />
        </MediaRow>
        <v-btn
          variant="text"
          size="small"
          class="mt-n4 mb-4"
          :title="t('decouverte.recent.clear_title')"
          @click="clearRecent"
          >{{ t('decouverte.recent.clear') }}</v-btn
        >
      </section>

      <MediaRow
        v-for="[key, title] in SECTIONS"
        v-show="home.isFetching.value || (home.data.value?.[key].length ?? 0) > 0"
        :key="key"
        :title="t(title)"
        :loading="home.isFetching.value && !home.data.value"
      >
        <MediaCard
          v-for="card in home.data.value?.[key] ?? []"
          :key="`${card.type}-${card.id}`"
          :card="card"
          width="150"
          @open="openCard"
        />
      </MediaRow>
    </template>

    <TmdbDetailDialog v-model="detail" @viewed="pushRecent" />
    <PersonSheet v-model="personId" :name="person?.name ?? ''" @open="openCard" />
  </v-container>
</template>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.best-overview,
.hero-overview {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
