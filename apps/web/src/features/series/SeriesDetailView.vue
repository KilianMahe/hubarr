<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Fiche d'une série (`#modal-serie` de `series.html.twig`, P3a.2), en **page**
// à défilement en cartes à l'URL de l'original (`/medias/:slug/series/:id`,
// page n° 195 ; P5b.3) ; l'ancien `?open=<id>` y redirige.
//
// En-tête sur l'image de fond (affiche, statut, titre, chaîne · année · durée
// · certification · note, genres), rangée d'actions (suivi, recherche des
// manquants, actualisation, renommage, fichiers, édition), puis cartes :
// retour d'action, synopsis repliable, saisons (téléchargés, taille,
// manquants, puis saisons et épisodes), historique, suppression.
// Historique, fichiers, renommage, édition et recherche interactive
// s'ouvrent en feuille (bottom sheet sur mobile, dialogue sur desktop).
import { formatGb } from '../../app/format';
import type {
  Episode,
  SeriesDetail,
  SeriesEditRequest,
  SeriesLibraryItem,
  SeriesRelease,
} from '@hubarr/shared';
import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiBookmark,
  mdiBookmarkOutline,
  mdiChevronRight,
  mdiDelete,
  mdiDownload,
  mdiFolderOutline,
  mdiTelevisionClassic,
  mdiFileDocumentMultipleOutline,
  mdiFormTextboxPassword,
  mdiHistory,
  mdiLightningBolt,
  mdiMagnify,
  mdiPencil,
  mdiRefresh,
  mdiStar,
} from '@mdi/js';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { ApiError } from '../../app/api/client';
import { useServiceFab } from '../../app/service-chrome';
import BulkDeleteDialog from '../../components/BulkDeleteDialog.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import DetailCard from '../../components/ds/DetailCard.vue';
import DetailHeader from '../../components/ds/DetailHeader.vue';
import ReleaseList from '../../components/ReleaseList.vue';
import type { GrabState } from '../../components/release-sort';
import { reportedDownloads } from '../movies/library';
import { posterUrl } from '../movies/movie-display';
import { useArrCommand } from '../movies/useArrCommand';
import SeriesEditPanel from './SeriesEditPanel.vue';
import SeriesFileManager from './SeriesFileManager.vue';
import SeriesHistoryPanel from './SeriesHistoryPanel.vue';
import SeriesRenamePanel from './SeriesRenamePanel.vue';
import SeriesSeasons from './SeriesSeasons.vue';
import { episodeCode } from './library';
import { seriesApi, seriesKeys } from './series-api';
import { releaseLabels, type SearchState } from './series-detail';

const route = useRoute();
const router = useRouter();
// Paramètres de la route (la page est réutilisée d'une série à l'autre).
const props = computed(() => ({
  slug: String(route.params.slug ?? ''),
  seriesId: Number(route.params.id) || null,
}));

const { t } = useI18n();
const queryClient = useQueryClient();
const commands = useArrCommand({ statusOf: seriesApi.commandStatus });

const open = computed(() => props.value.seriesId !== null);
const id = computed(() => props.value.seriesId ?? 0);

// Série de la bibliothèque déjà en cache : en-tête affiché avant la fiche complète.
const preview = computed(() =>
  queryClient
    .getQueriesData<{ items?: SeriesLibraryItem[] }>({
      queryKey: [...seriesKeys.all(props.value.slug), 'library'],
    })
    .flatMap(([, data]) => data?.items ?? [])
    .find((item) => item.id === id.value),
);
/** La série a changé : la bibliothèque sera relue au retour. */
function emitChanged(): void {
  void queryClient.invalidateQueries({
    queryKey: [...seriesKeys.all(props.value.slug), 'library'],
  });
}
/** Retour à la bibliothèque : arrière si on en vient, sinon navigation. */
function goBack(): void {
  const library = router.resolve({ name: 'sonarr', params: { slug: props.value.slug } });
  const back = (router.options.history.state as { back?: unknown } | null)?.back;
  if (typeof back === 'string' && back.startsWith(library.path)) router.back();
  else void router.push(library);
}

// ── Données ─────────────────────────────────────────────────────────────────

const detail = useQuery({
  queryKey: computed(() => seriesKeys.series(props.value.slug, id.value)),
  queryFn: ({ signal }) => seriesApi.info(props.value.slug, id.value, signal),
  enabled: open,
  retry: false,
});
const episodes = useQuery({
  queryKey: computed(() => seriesKeys.seriesSection(props.value.slug, id.value, 'episodes')),
  queryFn: ({ signal }) => seriesApi.episodes(props.value.slug, id.value, signal),
  enabled: open,
  retry: false,
});
const files = useQuery({
  queryKey: computed(() => seriesKeys.seriesSection(props.value.slug, id.value, 'files')),
  queryFn: ({ signal }) => seriesApi.files(props.value.slug, id.value, signal),
  enabled: open,
  retry: false,
});
const configWanted = ref(false);
const config = useQuery({
  queryKey: computed(() => seriesKeys.config(props.value.slug)),
  queryFn: ({ signal }) => seriesApi.config(props.value.slug, signal),
  enabled: computed(() => open.value && configWanted.value),
  staleTime: 60_000,
});

const series = computed<SeriesDetail | undefined>(() => detail.data.value);
const notFound = computed(
  () => detail.error.value instanceof ApiError && detail.error.value.status === 404,
);
const title = computed(() => series.value?.title ?? preview.value?.title ?? '');
const year = computed(() => series.value?.year ?? preview.value?.year ?? null);
const fanart = computed(() => posterUrl(series.value?.fanart ?? null, 'w1280'));
const poster = computed(() =>
  posterUrl(series.value?.poster ?? preview.value?.poster ?? null, 'w342'),
);

/** Relit la fiche, ses épisodes et ses fichiers (après une commande ou une modification). */
async function reloadAll(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: seriesKeys.series(props.value.slug, id.value) });
}

// ── Bannière de la fiche ────────────────────────────────────────────────────

interface Banner {
  type: 'info' | 'success' | 'warning' | 'error';
  text: string;
}
const banner = ref<Banner | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
function showBanner(type: Banner['type'], text: string): void {
  clearTimeout(bannerTimer);
  banner.value = { type, text };
  if (type !== 'info') bannerTimer = setTimeout(() => (banner.value = null), 5_000);
}
watch(id, () => {
  banner.value = null;
  panel.value = null;
  searches.value = {};
});

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NETWORK')
    return t('media.series.detail.network_error');
  return t('media.series.detail.unknown_error');
}

/** Suit une commande (`pollCmd`) : bilan dans la bannière ; `true` si elle a abouti. */
async function follow(cmdId: number, label: string, isSearch: boolean): Promise<boolean> {
  showBanner('info', t('media.series.warnings.cmd_in_progress_tpl', { label }));
  const result = await commands.follow(props.value.slug, cmdId, ({ status, elapsed }) => {
    const msg =
      status.message ??
      t('media.series.detail.search_in_progress_generic_tpl', { seconds: elapsed });
    showBanner('info', t('media.series.warnings.cmd_elapsed_tpl', { label, msg }));
  });
  if (result.outcome === 'failed') {
    const error = result.status.message ?? t('media.series.detail.unknown_error');
    showBanner('error', t('media.series.warnings.cmd_failed_tpl', { label, error }));
    return false;
  }
  if (result.outcome !== 'completed') return false;
  const count = reportedDownloads(result.status.message ?? '');
  if (count !== null && count > 0) {
    showBanner('success', t('media.series.warnings.cmd_dl_ok_tpl', { label, count }));
  } else if (count === 0 && isSearch) {
    showBanner('warning', t('media.series.warnings.cmd_nothing_tpl', { label }));
  } else {
    showBanner('success', t('media.series.warnings.cmd_done_tpl', { label }));
  }
  return true;
}

// ── Actions de la série ─────────────────────────────────────────────────────

const busy = reactive({ monitor: false, refresh: false, search: false, saving: false });

async function toggleMonitor(): Promise<void> {
  const current = series.value;
  if (current === undefined) return;
  busy.monitor = true;
  try {
    await seriesApi.monitor(props.value.slug, current.id, !current.monitored);
    emitChanged();
    await reloadAll();
  } catch (error) {
    showBanner('error', errorText(error));
  } finally {
    busy.monitor = false;
  }
}

async function refresh(): Promise<void> {
  busy.refresh = true;
  try {
    const started = await seriesApi.refresh(props.value.slug, id.value);
    if (started.cmdId !== null) {
      busy.refresh = false;
      if (await follow(started.cmdId, t('media.series.warnings.refresh_label'), false)) {
        emitChanged();
        await reloadAll();
      }
    }
  } catch (error) {
    showBanner('error', errorText(error));
  } finally {
    busy.refresh = false;
  }
}

async function searchMissing(): Promise<void> {
  busy.search = true;
  try {
    const started = await seriesApi.search(props.value.slug, id.value);
    busy.search = false;
    if (started.count === 0) {
      showBanner('success', t('media.api.no_missing_episodes'));
    } else if (started.cmdId !== null) {
      await follow(started.cmdId, t('media.series.detail.search_series'), true);
    }
  } catch (error) {
    showBanner('error', errorText(error));
  } finally {
    busy.search = false;
  }
}

// ── Saisons et épisodes ─────────────────────────────────────────────────────

const searches = ref<Record<string, SearchState>>({});

async function runSearch(
  key: string,
  start: () => Promise<{ cmdId: number | null }>,
  label: string,
) {
  searches.value = { ...searches.value, [key]: 'running' };
  try {
    const started = await start();
    if (started.cmdId !== null) await follow(started.cmdId, label, true);
    searches.value = { ...searches.value, [key]: 'done' };
  } catch (error) {
    searches.value = Object.fromEntries(
      Object.entries(searches.value).filter(([name]) => name !== key),
    );
    showBanner('error', errorText(error));
  }
}

function searchEpisode(episode: Episode): void {
  void runSearch(
    `e${episode.id}`,
    () => seriesApi.episodeSearch(props.value.slug, [episode.id]),
    t('media.series.detail.search_cmd_episode'),
  );
}
function searchSeason(season: number): void {
  void runSearch(
    `s${season}`,
    () => seriesApi.seasonSearch(props.value.slug, id.value, season),
    t('media.series.detail.search_season_tpl', { n: season }),
  );
}

async function seasonMonitor(season: number, monitored: boolean): Promise<void> {
  try {
    await seriesApi.seasonMonitor(props.value.slug, {
      seriesId: id.value,
      seasonNumber: season,
      monitored,
    });
    emitChanged();
    await reloadAll();
  } catch (error) {
    showBanner('error', errorText(error));
  }
}

/** Suivi d'un ou plusieurs épisodes (Maj+clic) : mis à jour aussitôt, annulé en cas d'échec. */
async function episodeMonitor(episodeIds: number[], monitored: boolean): Promise<void> {
  const key = seriesKeys.seriesSection(props.value.slug, id.value, 'episodes');
  const before = queryClient.getQueryData<Episode[]>(key);
  queryClient.setQueryData<Episode[]>(key, (list) =>
    (list ?? []).map((episode) =>
      episodeIds.includes(episode.id) ? { ...episode, monitored } : episode,
    ),
  );
  const results = await Promise.allSettled(
    episodeIds.map((episodeId) => seriesApi.episodeMonitor(props.value.slug, episodeId, monitored)),
  );
  if (results.some((result) => result.status === 'rejected')) {
    queryClient.setQueryData(key, before);
    showBanner('error', t('media.series.detail.error'));
  }
}

// La cible survit à la fermeture du dialogue, qui précède l'émission de `confirm`.
const fileToDelete = ref<number | null>(null);
const fileDeleteOpen = ref(false);
function askDeleteFile(fileId: number): void {
  fileToDelete.value = fileId;
  fileDeleteOpen.value = true;
}
async function deleteFile(): Promise<void> {
  const fileId = fileToDelete.value;
  if (fileId === null) return;
  try {
    await seriesApi.deleteFile(props.value.slug, fileId);
    showBanner('success', t('media.series.detail.file_deleted'));
    emitChanged();
    await reloadAll();
  } catch {
    showBanner('error', t('media.series.detail.file_delete_error'));
  }
}

// ── Panneaux (historique, fichiers, renommage, édition, releases) ──────────

type ReleaseTarget = { kind: 'episode'; episode: Episode } | { kind: 'season'; season: number };
type Panel =
  | { kind: 'history'; season: number | null }
  | { kind: 'files'; season: number | null }
  | { kind: 'rename'; season: number | null }
  | { kind: 'edit' }
  | { kind: 'releases'; target: ReleaseTarget };
const panel = ref<Panel | null>(null);

const panelTitle = computed(() => {
  const value = panel.value;
  if (value === null) return '';
  switch (value.kind) {
    case 'history':
      return t('media.series.detail.history');
    case 'files':
      return value.season === null
        ? t('media.series.detail.filemanager_title')
        : t('media.series.detail.filemanager_season_title_tpl', { n: value.season });
    case 'rename':
      return t('media.series.detail.rename_files');
    case 'edit':
      return t('media.series.detail.edit_series_tpl', { title: title.value });
    case 'releases':
      return value.target.kind === 'season'
        ? t('media.series.detail.releases_season_tpl', { n: value.target.season })
        : t('media.series.detail.releases_episode_tpl', {
            label: episodeCode(
              value.target.episode.seasonNumber,
              value.target.episode.episodeNumber,
            ),
          });
  }
});

const history = useQuery({
  queryKey: computed(() => seriesKeys.seriesSection(props.value.slug, id.value, 'history')),
  queryFn: ({ signal }) => seriesApi.history(props.value.slug, id.value, signal),
  enabled: open,
  staleTime: 0,
  retry: false,
});

function openPanel(next: Panel): void {
  if (next.kind === 'edit') configWanted.value = true;
  if (next.kind === 'releases') void loadReleases(next.target);
  panel.value = next;
}

async function onPanelSaved(): Promise<void> {
  emitChanged();
  await reloadAll();
}

// Recherche interactive.
interface ReleasesState {
  loading: boolean;
  error: 'timeout' | 'error' | null;
  list: SeriesRelease[];
  grabs: Record<string, GrabState>;
}
const releases = reactive<ReleasesState>({ loading: false, error: null, list: [], grabs: {} });
let releaseSeq = 0;
async function loadReleases(target: ReleaseTarget): Promise<void> {
  const seq = ++releaseSeq;
  Object.assign(releases, { loading: true, error: null, list: [], grabs: {} });
  try {
    const list =
      target.kind === 'episode'
        ? await seriesApi.episodeReleases(props.value.slug, target.episode.id)
        : await seriesApi.seasonReleases(props.value.slug, id.value, target.season);
    if (seq === releaseSeq) releases.list = list;
  } catch (error) {
    if (seq !== releaseSeq) return;
    releases.error =
      error instanceof ApiError && error.code === 'SEARCH_TIMED_OUT' ? 'timeout' : 'error';
  } finally {
    if (seq === releaseSeq) releases.loading = false;
  }
}
const labels = computed(() => releaseLabels(t, releases.list));
async function grab(release: SeriesRelease): Promise<void> {
  releases.grabs = { ...releases.grabs, [release.guid]: 'pending' };
  try {
    await seriesApi.grab(props.value.slug, release.guid, release.indexerId);
    releases.grabs = { ...releases.grabs, [release.guid]: 'done' };
    showBanner('success', t('media.series.detail.download_started'));
  } catch (error) {
    releases.grabs = { ...releases.grabs, [release.guid]: 'failed' };
    const message = error instanceof ApiError ? (error.serverMessage ?? '') : '';
    showBanner(
      'error',
      t('media.series.detail.grab_error_tpl', {
        error: message || t('media.series.detail.unknown_error'),
      }),
    );
  }
}

// ── Édition, suppression ────────────────────────────────────────────────────

async function saveEdit(changes: SeriesEditRequest): Promise<void> {
  busy.saving = true;
  try {
    const { series: updated } = await seriesApi.edit(props.value.slug, id.value, changes);
    queryClient.setQueryData(seriesKeys.series(props.value.slug, id.value), updated);
    showBanner('success', t('media.series.detail.series_updated'));
    panel.value = null;
    emitChanged();
  } catch (error) {
    showBanner('error', t('media.series.detail.save_error_tpl', { error: errorText(error) }));
  } finally {
    busy.saving = false;
  }
}
async function updatePath(path: string): Promise<void> {
  try {
    const { series: updated } = await seriesApi.edit(props.value.slug, id.value, { path });
    queryClient.setQueryData(seriesKeys.series(props.value.slug, id.value), updated);
    showBanner('success', t('media.series.detail.path_updated'));
    emitChanged();
  } catch (error) {
    showBanner('error', t('media.series.detail.save_error_tpl', { error: errorText(error) }));
  }
}

const deleteOpen = ref(false);
const deleting = ref(false);
async function confirmRemove(deleteFiles: boolean, addImportExclusion: boolean): Promise<void> {
  deleting.value = true;
  try {
    await seriesApi.remove(props.value.slug, id.value, { deleteFiles, addImportExclusion });
    deleteOpen.value = false;
    emitChanged();
    // Bannière de la bibliothèque (état de l'historique).
    await router.replace({
      name: 'sonarr',
      params: { slug: props.value.slug },
      state: { removedSeries: title.value },
    });
  } catch (error) {
    deleteOpen.value = false;
    showBanner('error', errorText(error));
  } finally {
    deleting.value = false;
  }
}

// ── Affichage ───────────────────────────────────────────────────────────────

const overviewOpen = ref(false);
const progress = computed(() => {
  const value = series.value ?? preview.value;
  if (value === undefined) return null;
  return { files: value.episodeFileCount, total: value.episodeCount, percent: value.percent };
});
// Speed-dial (mobile, D130, P5b.4) : recherche, actualisation, renommage,
// fichiers et édition, à la place du FAB d'ajout ; la rangée garde le suivi.
const { smAndDown } = useDisplay();
useServiceFab(() =>
  smAndDown.value && series.value
    ? {
        icon: mdiLightningBolt,
        label: t('common.ds.actions'),
        testId: 'series-speed-dial',
        actions: [
          {
            icon: mdiMagnify,
            label: t('media.series.detail.search_monitored'),
            testId: 'series-search-missing',
            onClick: () => void searchMissing(),
          },
          {
            icon: mdiRefresh,
            label: t('media.series.detail.refresh_scan'),
            testId: 'series-refresh',
            onClick: () => void refresh(),
          },
          {
            icon: mdiFormTextboxPassword,
            label: t('media.series.detail.rename_files'),
            testId: 'series-rename-open',
            onClick: () => {
              openPanel({ kind: 'rename', season: null });
            },
          },
          {
            icon: mdiFileDocumentMultipleOutline,
            label: t('media.series.detail.manage_files'),
            testId: 'series-files-open',
            onClick: () => {
              openPanel({ kind: 'files', season: null });
            },
          },
          {
            icon: mdiPencil,
            label: t('media.series.detail.modify'),
            testId: 'series-edit-open',
            onClick: () => {
              openPanel({ kind: 'edit' });
            },
          },
        ],
      }
    : null,
);
</script>

<template>
  <div class="detail-page" data-test="series-detail">
    <ServiceDownBanner service="sonarr" :instance="props.slug" />
    <DetailHeader
      :title="title"
      :fanart="fanart"
      :poster="poster"
      title-test="series-title"
      back-test="series-detail-close"
      @back="goBack"
    >
      <template #title
        >{{ title }}<template v-if="year"> ({{ year }})</template></template
      >
      <div v-if="series" class="d-flex flex-wrap ga-1 my-2" data-test="series-badges">
        <v-chip v-if="series.status === 'continuing'" size="small" variant="flat" color="success">{{
          t('media.series.status.continuing')
        }}</v-chip>
        <v-chip v-else-if="series.status === 'ended'" size="small" variant="flat">{{
          t('media.series.status.ended')
        }}</v-chip>
        <v-chip
          v-if="series.seriesType === 'anime'"
          size="small"
          variant="flat"
          color="secondary"
          >{{ t('media.series.status.anime') }}</v-chip
        >
        <v-chip size="small" variant="flat" color="surface">{{
          t('media.series.status.season_tpl', { count: series.seasonCount })
        }}</v-chip>
      </div>
      <div v-if="series" class="d-flex flex-wrap align-center ga-3 text-body-medium detail-soft">
        <span v-if="series.network">{{ series.network }}</span>
        <span v-if="series.runtime">{{
          t('dashboard.quicklook.runtime', { min: series.runtime })
        }}</span>
        <v-chip v-if="series.certification" size="x-small" label variant="outlined">{{
          series.certification
        }}</v-chip>
        <span v-if="series.ratings && series.ratings > 0" class="detail-rating">
          <v-icon :icon="mdiStar" size="16" color="#f5c518" />{{ series.ratings.toFixed(1) }}
        </span>
      </div>
      <div v-if="series && series.genres.length > 0" class="d-flex flex-wrap ga-1 mt-2">
        <v-chip v-for="genre in series.genres" :key="genre" size="x-small" variant="tonal">{{
          genre
        }}</v-chip>
      </div>
    </DetailHeader>

    <div class="detail-page__body">
      <EmptyState
        v-if="notFound"
        :icon="mdiAlertCircleOutline"
        :title="t('media.api.series_not_found')"
      />
      <EmptyState
        v-else-if="detail.isError.value && !series"
        :icon="mdiAlertCircleOutline"
        :title="t('media.series.detail.load_error_short')"
      >
        <v-btn variant="tonal" @click="detail.refetch()">{{ t('common.action.retry') }}</v-btn>
      </EmptyState>
      <div v-else-if="!series" class="d-flex justify-center pa-8">
        <v-progress-circular indeterminate color="service" />
      </div>
      <template v-else>
        <!-- Rangée d'actions : suivi (état explicite), recherche, actualisation, gestion -->
        <div class="detail-page__actions">
          <v-btn
            :prepend-icon="series.monitored ? mdiBookmark : mdiBookmarkOutline"
            :variant="series.monitored ? 'tonal' : 'outlined'"
            :color="series.monitored ? 'service-text' : undefined"
            :aria-pressed="series.monitored"
            :loading="busy.monitor"
            data-test="series-monitor"
            @click="toggleMonitor"
            >{{
              t(series.monitored ? 'media.series.detail.unmonitor' : 'media.series.detail.monitor')
            }}</v-btn
          >
          <!-- Mobile : ces actions sont dans le speed-dial -->
          <template v-if="!smAndDown">
            <v-btn
              :prepend-icon="mdiMagnify"
              color="service"
              variant="flat"
              :loading="busy.search"
              data-test="series-search-missing"
              @click="searchMissing"
              >{{ t('media.series.detail.search_monitored') }}</v-btn
            >
            <v-btn
              :prepend-icon="mdiRefresh"
              variant="text"
              :loading="busy.refresh"
              data-test="series-refresh"
              @click="refresh"
              >{{ t('media.series.detail.refresh_scan') }}</v-btn
            >
            <v-btn
              :prepend-icon="mdiFormTextboxPassword"
              variant="text"
              data-test="series-rename-open"
              @click="openPanel({ kind: 'rename', season: null })"
              >{{ t('media.series.detail.rename_files') }}</v-btn
            >
            <v-btn
              :prepend-icon="mdiFileDocumentMultipleOutline"
              variant="text"
              data-test="series-files-open"
              @click="openPanel({ kind: 'files', season: null })"
              >{{ t('media.series.detail.manage_files') }}</v-btn
            >
            <v-btn
              :prepend-icon="mdiPencil"
              variant="text"
              data-test="series-edit-open"
              @click="openPanel({ kind: 'edit' })"
              >{{ t('media.series.detail.modify') }}</v-btn
            >
          </template>
        </div>

        <v-alert
          v-if="banner"
          :type="banner.type"
          variant="tonal"
          density="compact"
          class="mb-3"
          data-test="series-detail-banner"
        >
          <div class="d-flex align-center ga-2">
            <v-progress-circular v-if="banner.type === 'info'" indeterminate size="16" width="2" />
            <span>{{ banner.text }}</span>
          </div>
        </v-alert>

        <div class="detail-page__cards">
          <DetailCard :title="t('media.series.detail.synopsis')" class="detail-page__wide">
            <p
              class="text-body-medium detail-overview"
              :class="{ 'detail-overview--clamped': !overviewOpen }"
            >
              {{ series.overview || t('media.series.detail.no_synopsis') }}
            </p>
            <v-btn
              v-if="(series.overview ?? '').length > 280"
              variant="text"
              size="small"
              class="px-0"
              @click="overviewOpen = !overviewOpen"
              >{{ t(overviewOpen ? 'common.action.close' : 'common.action.view_more') }}</v-btn
            >
          </DetailCard>

          <!-- Saisons : résumé (téléchargés, taille, manquants), puis saisons et épisodes -->
          <DetailCard
            :title="t('media.series.detail.seasons')"
            :icon="mdiTelevisionClassic"
            class="detail-page__wide"
          >
            <div v-if="progress" class="series-summary" data-test="series-progress">
              <div class="series-summary__item">
                <v-icon :icon="mdiDownload" size="18" color="service-text" />
                <span class="text-caption text-muted">{{ t('media.films.stats.downloaded') }}</span>
                <strong>{{ progress.files }}/{{ progress.total }}</strong>
              </div>
              <div class="series-summary__item">
                <v-icon :icon="mdiFolderOutline" size="18" color="service-text" />
                <span class="text-caption text-muted">{{
                  t('media.series.stats.total_size')
                }}</span>
                <strong>{{ formatGb(series.sizeGb ?? 0) }}</strong>
              </div>
              <div class="series-summary__item">
                <v-icon :icon="mdiAlertOutline" size="18" color="error" />
                <span class="text-caption text-muted">{{
                  t('media.films.filters.status.missing')
                }}</span>
                <strong :class="{ 'text-error': progress.total - progress.files > 0 }">{{
                  Math.max(0, progress.total - progress.files)
                }}</strong>
              </div>
              <v-progress-linear
                :model-value="progress.percent"
                :color="progress.percent === 100 ? 'success' : 'service'"
                height="6"
                rounded
                class="series-summary__bar"
              />
            </div>
            <v-progress-linear v-if="episodes.isPending.value" indeterminate color="service" />
            <SeriesSeasons
              v-else
              :episodes="episodes.data.value ?? []"
              :files="files.data.value ?? []"
              :series-monitored="series.monitored"
              :searches="searches"
              @season-monitor="seasonMonitor"
              @episode-monitor="episodeMonitor"
              @search-episode="searchEpisode"
              @interactive-episode="
                (episode) => openPanel({ kind: 'releases', target: { kind: 'episode', episode } })
              "
              @search-season="searchSeason"
              @interactive-season="
                (season) => openPanel({ kind: 'releases', target: { kind: 'season', season } })
              "
              @season-files="(season) => openPanel({ kind: 'files', season })"
              @season-rename="(season) => openPanel({ kind: 'rename', season })"
              @season-history="(season) => openPanel({ kind: 'history', season })"
              @delete-file="askDeleteFile"
            />
          </DetailCard>

          <!-- Historique résumé : l'historique complet en feuille -->
          <DetailCard
            :title="t('media.series.detail.history')"
            :icon="mdiHistory"
            data-test="series-history-card"
          >
            <template #actions>
              <v-btn
                variant="text"
                size="small"
                :append-icon="mdiChevronRight"
                data-test="series-history-open"
                @click="openPanel({ kind: 'history', season: null })"
                >{{ t('common.action.view_all') }}</v-btn
              >
            </template>
            <v-progress-linear v-if="history.isPending.value" indeterminate color="service" />
            <SeriesHistoryPanel
              v-else
              :items="(history.data.value ?? []).slice(0, 3)"
              :season="null"
            />
          </DetailCard>

          <!-- Suppression -->
          <DetailCard :title="t('common.action.delete')" :icon="mdiDelete" title-color="error">
            <v-btn
              :prepend-icon="mdiDelete"
              variant="tonal"
              size="small"
              color="error"
              data-test="series-delete"
              @click="deleteOpen = true"
              >{{ t('media.series.detail.delete_series') }}</v-btn
            >
          </DetailCard>
        </div>
      </template>
    </div>

    <!-- Feuille de la section ouverte (bottom sheet sur mobile, dialogue sur desktop) -->
    <ResponsiveDialog
      :model-value="panel !== null"
      :title="panelTitle"
      :max-width="1000"
      @update:model-value="(v: boolean) => !v && (panel = null)"
    >
      <div v-if="panel && series" data-test="series-panel">
        <SeriesHistoryPanel
          v-if="panel.kind === 'history'"
          :items="history.data.value"
          :season="panel.season"
        />
        <SeriesFileManager
          v-else-if="panel.kind === 'files'"
          :slug="props.slug"
          :series-id="series.id"
          :season="panel.season"
          @saved="onPanelSaved"
        />
        <SeriesRenamePanel
          v-else-if="panel.kind === 'rename'"
          :slug="props.slug"
          :series-id="series.id"
          :season="panel.season"
          @done="onPanelSaved"
        />
        <SeriesEditPanel
          v-else-if="panel.kind === 'edit'"
          :slug="props.slug"
          :series="series"
          :config="config.data.value"
          :saving="busy.saving"
          @save="saveEdit"
          @update-path="updatePath"
          @delete="deleteOpen = true"
          @cancel="panel = null"
        />
        <div v-else-if="panel.kind === 'releases'" data-test="series-releases">
          <div v-if="releases.loading" class="d-flex align-center ga-2 pa-3 text-body-small">
            <v-progress-circular indeterminate size="16" width="2" />
            {{
              panel.target.kind === 'season'
                ? t('media.series.detail.interrogating_indexers_season_tpl', {
                    n: panel.target.season,
                  })
                : t('media.series.detail.interrogating_indexers')
            }}
          </div>
          <p v-else-if="releases.error" class="text-error text-body-small pa-3">
            {{
              releases.error === 'timeout'
                ? t('media.series.detail.loading_error_indexers')
                : t('media.series.detail.loading_error_full')
            }}
          </p>
          <p v-else-if="releases.list.length === 0" class="text-muted text-body-small pa-3">
            {{ t('media.series.detail.no_release_found') }}
          </p>
          <ReleaseList
            v-else
            :releases="releases.list"
            :grabs="releases.grabs"
            :labels="labels"
            @grab="(release) => grab(release as SeriesRelease)"
          />
        </div>
      </div>
      <template #actions>
        <v-btn variant="text" data-test="series-panel-back" @click="panel = null">{{
          t('media.series.detail.close')
        }}</v-btn>
      </template>
    </ResponsiveDialog>

    <BulkDeleteDialog
      v-model="deleteOpen"
      :titles="[title]"
      :loading="deleting"
      i18n-prefix="media.series.bulk"
      @confirm="confirmRemove"
    />
    <ConfirmDialog
      v-model="fileDeleteOpen"
      :message="t('media.series.detail.confirm_delete_file')"
      @confirm="deleteFile"
    />
  </div>
</template>

<style scoped>
.series-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px;
  padding-bottom: 12px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.series-summary__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}
.series-summary__bar {
  grid-column: 1 / -1;
}
</style>
