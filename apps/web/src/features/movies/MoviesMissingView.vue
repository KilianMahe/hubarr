<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Films manquants (`media/films_missing.html.twig`) : films suivis sans fichier,
// 50 par page. Rechercher un film (suivi de la commande sur la ligne), ne plus
// le suivre (ligne barrée), rechercher tous les manquants (bandeau de
// progression « Film x/n — titre », bilan des téléchargements).
import type { MissingMovie } from '@hubarr/shared';
import { mdiBookmarkOff, mdiMagnify } from '@mdi/js';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import ArrPager from '../../components/ArrPager.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import RadarrNav from './RadarrNav.vue';
import { reportedDownloads, searchedTitle } from './library';
import { posterUrl } from './movie-display';
import { moviesApi, moviesKeys } from './movies-api';
import { useArrCommand } from './useArrCommand';
import { useRoutePage } from './useRoutePage';
import { mediaDetailLocation } from '../../app/media-links';
import EmptyState from '../../components/EmptyState.vue';

const { t } = useI18n();
const format = useFormat();
const commands = useArrCommand();
const { slug, page, setPage } = useRoutePage();

const missing = useQuery({
  queryKey: computed(() => moviesKeys.page(slug.value, 'missing', String(page.value))),
  queryFn: ({ signal }) => moviesApi.missing(slug.value, page.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const records = computed(() => missing.data.value?.records ?? []);
const total = computed(() => missing.data.value?.totalRecords ?? 0);

const unavailable = (movie: MissingMovie) =>
  movie.status === 'announced' || movie.status === 'inCinemas';
function statusChip(movie: MissingMovie): { color: string; label: string; tip: string } {
  if (movie.status === 'announced')
    return {
      color: 'info',
      label: t('media.films_missing.status_announced'),
      tip: t('media.films_missing.announced_tip'),
    };
  if (movie.status === 'inCinemas')
    return {
      color: 'info',
      label: t('media.films_missing.status_in_cinemas'),
      tip: t('media.films_missing.in_cinemas_tip'),
    };
  if (movie.status === 'released')
    return {
      color: 'warning',
      label: t('media.films_missing.status_missing'),
      tip: t('media.films_missing.released_missing_tip'),
    };
  return { color: 'muted', label: movie.status, tip: '' };
}

// ── Bandeau ─────────────────────────────────────────────────────────────────
const banner = ref<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);

// ── Rechercher un film ──────────────────────────────────────────────────────
interface RowSearch {
  state: 'running' | 'found' | 'nothing' | 'error';
  message: string;
}
const rows = reactive(new Map<number, RowSearch>());
async function searchOne(movie: MissingMovie): Promise<void> {
  rows.set(movie.id, { state: 'running', message: t('media.films_missing.searching') });
  try {
    const started = await moviesApi.search(slug.value, movie.id);
    if (started.cmdId === null) throw new Error('no command');
    const result = await commands.follow(slug.value, started.cmdId, ({ status }) => {
      if (status.message) rows.set(movie.id, { state: 'running', message: status.message });
    });
    if (result.outcome === 'completed') {
      const count = reportedDownloads(result.status.message ?? '') ?? 0;
      rows.set(
        movie.id,
        count > 0
          ? { state: 'found', message: t('media.films_missing.download_started') }
          : { state: 'nothing', message: t('media.films_missing.nothing_found') },
      );
    } else if (result.outcome === 'failed') {
      rows.set(movie.id, { state: 'error', message: t('media.films_missing.error') });
    }
  } catch {
    rows.set(movie.id, { state: 'error', message: t('media.films_missing.error') });
  }
}
const ROW_COLORS = {
  running: 'text-muted',
  found: 'text-success',
  nothing: 'text-warning',
  error: 'text-error',
};

// ── Ne plus suivre ──────────────────────────────────────────────────────────
const unmonitored = reactive(new Set<number>());
const unmonitorTarget = ref<MissingMovie | null>(null);
const unmonitorOpen = ref(false);
function askUnmonitor(movie: MissingMovie): void {
  unmonitorTarget.value = movie;
  unmonitorOpen.value = true;
}
async function unmonitor(): Promise<void> {
  const movie = unmonitorTarget.value;
  if (movie === null) return;
  try {
    await moviesApi.monitor(slug.value, movie.id, false);
    unmonitored.add(movie.id);
  } catch {
    banner.value = { type: 'error', text: t('media.films_missing.network_error') };
  }
}

// ── Rechercher tous les manquants ───────────────────────────────────────────
const searchAllOpen = ref(false);
const searchingAll = ref(false);
function askSearchAll(): void {
  if (total.value === 0) {
    banner.value = { type: 'warning', text: t('media.films_missing.no_missing') };
    return;
  }
  searchAllOpen.value = true;
}
async function searchAll(): Promise<void> {
  const count = total.value;
  searchingAll.value = true;
  banner.value = { type: 'info', text: t('media.films_missing.searching_for', { count }) };
  try {
    const started = await moviesApi.searchAllMissing(slug.value);
    if (started.cmdId === null) {
      banner.value = { type: 'error', text: t('media.films_missing.launch_error') };
      return;
    }
    let last = '';
    let done = 0;
    const result = await commands.follow(slug.value, started.cmdId, ({ status, elapsed }) => {
      const message = status.message ?? '';
      const title = searchedTitle(message);
      if (title !== null && title !== last) {
        last = title;
        done += 1;
      }
      banner.value = {
        type: 'info',
        text:
          done > 0
            ? t('media.films_missing.search_progress', { done, total: count, title: last })
            : message || t('media.films_missing.search_in_progress', { seconds: elapsed }),
      };
    });
    if (result.outcome === 'completed') {
      const message = result.status.message ?? '';
      const downloads = reportedDownloads(message) ?? 0;
      const searched = Number.parseInt(/(\d+) movies/.exec(message)?.[1] ?? '', 10) || count;
      banner.value =
        downloads > 0
          ? {
              type: 'success',
              text: t('media.films_missing.search_done_dl', { dl: downloads, total: searched }),
            }
          : {
              type: 'warning',
              text: t('media.films_missing.search_done_none', { total: searched }),
            };
      await missing.refetch();
    } else if (result.outcome === 'failed') {
      banner.value = {
        type: 'error',
        text: t('media.films_missing.search_failed', {
          error: result.status.message ?? t('media.films_missing.unknown_error'),
        }),
      };
    }
  } catch {
    banner.value = { type: 'error', text: t('media.films_missing.network_error') };
  } finally {
    searchingAll.value = false;
  }
}
</script>

<template>
  <v-container fluid class="radarr-page">
    <ServiceDownBanner service="radarr" :instance="slug" />
    <RadarrNav />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('media.films_missing.title') }}</h2>
      <v-chip
        v-if="missing.data.value"
        size="small"
        color="warning"
        variant="tonal"
        data-test="missing-total"
        >{{ total }}</v-chip
      >
      <v-spacer />
      <v-btn
        :prepend-icon="mdiMagnify"
        color="service"
        variant="flat"
        size="small"
        :loading="searchingAll"
        data-test="missing-search-all"
        @click="askSearchAll"
        >{{ t('media.films_missing.search_all') }}</v-btn
      >
    </div>
    <v-alert
      v-if="banner"
      :type="banner.type"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="page-banner"
    >
      <div class="d-flex align-center ga-2">
        <v-progress-circular v-if="banner.type === 'info'" indeterminate size="16" width="2" />
        <span>{{ banner.text }}</span>
      </div>
    </v-alert>

    <v-progress-linear v-if="missing.isPending.value" indeterminate color="service" />
    <v-card
      v-else-if="missing.data.value"
      variant="flat"
      border
      :class="{ 'opacity-60': missing.isPlaceholderData.value }"
    >
      <EmptyState v-if="records.length === 0" inline :title="t('media.films_missing.empty')" />
      <v-list v-else lines="two" class="py-0">
        <v-list-item
          v-for="movie in records"
          :key="movie.id"
          :class="{ 'radarr-row--off': unmonitored.has(movie.id) }"
          data-test="missing-row"
        >
          <template #prepend>
            <img
              v-if="posterUrl(movie.poster, 'w92')"
              :src="posterUrl(movie.poster, 'w92')!"
              alt=""
              class="radarr-poster"
              loading="lazy"
            />
            <div v-else class="radarr-poster" />
          </template>
          <v-list-item-title class="font-weight-medium">
            <router-link :to="mediaDetailLocation('radarr', slug, movie.id)" class="radarr-link">{{
              movie.title
            }}</router-link>
            <span class="text-muted text-body-small"> {{ movie.year ?? '—' }}</span>
          </v-list-item-title>
          <v-list-item-subtitle>
            <div class="d-flex flex-wrap align-center ga-1">
              <v-chip
                size="x-small"
                variant="tonal"
                :color="statusChip(movie).color"
                :title="statusChip(movie).tip"
                >{{ statusChip(movie).label }}</v-chip
              >
              <v-chip size="x-small" variant="tonal" color="info">{{
                movie.qualityProfile ?? '—'
              }}</v-chip>
              <span>{{ movie.releaseDate ? format.date(movie.releaseDate) : '—' }}</span>
            </div>
            <div
              v-if="rows.get(movie.id)"
              class="text-body-small mt-1"
              :class="ROW_COLORS[rows.get(movie.id)!.state]"
            >
              {{ rows.get(movie.id)!.message }}
            </div>
          </v-list-item-subtitle>
          <template #append>
            <v-btn
              v-if="!unavailable(movie)"
              :icon="mdiMagnify"
              size="small"
              variant="text"
              color="service-text"
              :loading="rows.get(movie.id)?.state === 'running'"
              :title="t('media.films_missing.search_title')"
              :aria-label="t('media.films_missing.search_title')"
              data-test="missing-search"
              @click="searchOne(movie)"
            />
            <v-btn
              :icon="mdiBookmarkOff"
              size="small"
              variant="text"
              :disabled="unmonitored.has(movie.id)"
              :title="t('media.films_missing.unmonitor_title')"
              :aria-label="t('media.films_missing.unmonitor_title')"
              data-test="missing-unmonitor"
              @click="askUnmonitor(movie)"
            />
          </template>
        </v-list-item>
      </v-list>
      <ArrPager
        :page="page"
        :count="records.length"
        :total="total"
        :page-size="missing.data.value.pageSize"
        i18n-prefix="media.films_missing"
        @update:page="setPage"
      />
    </v-card>

    <ConfirmDialog
      v-model="searchAllOpen"
      :message="t('media.films_missing.confirm_search_all', { count: total })"
      :confirm-label="t('media.films_missing.search_all')"
      @confirm="searchAll"
    />
    <ConfirmDialog
      v-model="unmonitorOpen"
      :message="t('media.films_missing.confirm_unmonitor')"
      :confirm-label="t('media.films_missing.unmonitor_title')"
      @confirm="unmonitor"
    />
  </v-container>
</template>

<style scoped>
.radarr-poster {
  width: 36px;
  height: 54px;
  border-radius: 4px;
  object-fit: cover;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.radarr-link {
  color: inherit;
  text-decoration: none;
}
.radarr-link:hover,
.radarr-link:focus-visible {
  text-decoration: underline;
}
.radarr-row--off {
  opacity: 0.35;
  text-decoration: line-through;
}
</style>
