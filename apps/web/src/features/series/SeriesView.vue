<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Bibliothèque de séries d'une instance Sonarr (`media/series.html.twig`,
// P3a.1) : statistiques, prochains épisodes, avertissements, recherche et
// filtres (dans l'URL), 5 vues, pagination, actions filtrées, commandes
// suivies, sélection et actions en masse, ajout.
//
// La fiche d'une série est une page (`/medias/:slug/series/:id`, page n° 195,
// SeriesDetailView, D130) ; l'ancien `?open=<id>` y redirige.
import { useDismissedAlerts } from '../../app/dismissed-alerts';
import { formatGb, gbParts } from '../../app/format';
import {
  DEFAULT_SERIES_LIBRARY_QUERY,
  SERIES_LIBRARY_STATUSES,
  hasActiveSeriesFilter,
  seriesFilterCount,
  type ApplyTagsMode,
  type LibraryWarning,
  type SeriesBulkEditRequest,
  type SeriesLibraryQuery,
  type SeriesLibraryStatus,
} from '@hubarr/shared';
import {
  msAdd,
  msCheckBox,
  msClose,
  msFilterList,
  msGridViewFill,
  msMoreVert,
  msRefresh,
  msRssFeed,
  msSearch,
  msShelves,
  msViewAgenda,
  msViewList,
  msViewModule,
} from '../../components/symbols';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { ApiError } from '../../app/api/client';
import { vLongPress } from '../../app/long-press';
import { useFabQueryAction, useTopBarSearch } from '../../app/service-chrome';
import { useSessionStore } from '../../app/stores/session';
import BulkDeleteDialog from '../../components/BulkDeleteDialog.vue';
import BulkRenameDialog from '../../components/BulkRenameDialog.vue';
import BulkTagsDialog from '../../components/BulkTagsDialog.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import LibraryPagination from '../../components/LibraryPagination.vue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import {
  mapLimit,
  reportedDownloads,
  initialViewMode,
  toggleSelection,
  VIEW_MODES,
  type ViewMode,
} from '../movies/library';
import { useArrCommand } from '../movies/useArrCommand';
import AddMediaDialog from '../add-media/AddMediaDialog.vue';
import SeriesBulkEditDialog from './SeriesBulkEditDialog.vue';
import { showEpisodes, useWatched, watchedCount } from '../activity/watched';
import SeriesCard from './SeriesCard.vue';
import SeriesFilters from './SeriesFilters.vue';
import SeriesListItem from './SeriesListItem.vue';
import SeriesQueuePanel from './SeriesQueuePanel.vue';
import SeriesShelves from './SeriesShelves.vue';
import SeriesTable from './SeriesTable.vue';
import SonarrNav from './SonarrNav.vue';
import BulkActionBar from '../../components/ds/BulkActionBar.vue';
import ViewModeMenu from '../../components/ds/ViewModeMenu.vue';
import FilterChips from '../../components/ds/FilterChips.vue';
import MetaLine from '../../components/ds/MetaLine.vue';
import PullToRefresh from '../../components/ds/PullToRefresh.vue';
import StatTile from '../../components/ds/StatTile.vue';
import {
  SERIES_TRACKED_COMMANDS,
  seriesApiParamsOf,
  seriesQueryFromRoute,
  seriesRouteQueryOf,
} from './library';
import { seriesApi, seriesKeys } from './series-api';
import { useSubtitleStatuses } from '../bazarr/bazarr-api';
import { vWrite } from '../../app/access';

const { t } = useI18n();
const route = useRoute();
const subtitles = useSubtitleStatuses('series');
const watched = useWatched();
const router = useRouter();
const session = useSessionStore();
const queryClient = useQueryClient();
const { mdAndUp, smAndDown } = useDisplay();
const commands = useArrCommand({ statusOf: seriesApi.commandStatus });

const slug = computed(() => String(route.params.slug ?? ''));
const defaultPerPage = computed(() => Number(session.preferences.display_page_size));
const query = computed(() => seriesQueryFromRoute(route.query, defaultPerPage.value));
// L'ancien lien profond `?open=` mène à la page de la série (redirection du routeur).
const apiParams = computed(() => seriesApiParamsOf(query.value));

// ── Données ─────────────────────────────────────────────────────────────────

const library = useQuery({
  queryKey: computed(() => seriesKeys.library(slug.value, apiParams.value.toString())),
  queryFn: ({ signal }) => seriesApi.library(slug.value, apiParams.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const warnings = useQuery({
  queryKey: computed(() => seriesKeys.warnings(slug.value)),
  queryFn: ({ signal }) => seriesApi.warnings(slug.value, signal),
  // Relus toutes les 10 s, comme le bandeau d'origine.
  refetchInterval: 10_000,
  retry: false,
});
const configWanted = ref(false);
const config = useQuery({
  queryKey: computed(() => seriesKeys.config(slug.value)),
  queryFn: ({ signal }) => seriesApi.config(slug.value, signal),
  enabled: configWanted,
  staleTime: 60_000,
});

const data = computed(() => library.data.value);
const items = computed(() => data.value?.items ?? []);
const facets = computed(() => data.value?.facets ?? { genres: [], networks: [] });
const unreachable = computed(
  () => library.error.value instanceof ApiError && library.error.value.status === 503,
);

function warningText(warning: LibraryWarning): string {
  if (warning.code === 'no_indexer') return t('media.api.no_indexer');
  if (warning.code === 'import_blocked') {
    return t('media.import.blocked_warning', { count: warning.count });
  }
  return t('media.api.warning_format', { source: warning.source, message: warning.message });
}
const warningTexts = computed(() => warnings.data.value?.warnings.map(warningText));
const alerts = useDismissedAlerts(() => `sonarr.${slug.value}`, warningTexts);
const visibleWarnings = computed(() =>
  (warningTexts.value ?? []).filter((text) => alerts.isVisible(text)),
);

// ── Navigation des filtres (l'URL est la source de vérité) ─────────────────

function navigate(next: SeriesLibraryQuery, page = 1, replace = false): void {
  const location = { query: seriesRouteQueryOf(next, defaultPerPage.value, page) };
  void (replace ? router.replace(location) : router.push(location));
}
function patch(change: Partial<SeriesLibraryQuery>): void {
  navigate({ ...query.value, ...change });
}
function goToPage(page: number): void {
  navigate(query.value, page);
}
function resetFilters(): void {
  navigate({ ...DEFAULT_SERIES_LIBRARY_QUERY, perPage: query.value.perPage });
}

// Recherche différée : une navigation 300 ms après la dernière frappe.
const search = ref(query.value.q);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => query.value.q,
  (q) => {
    if (q !== search.value.trim()) search.value = q;
  },
);
function onSearch(value: string | null): void {
  search.value = value ?? '';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (search.value.trim() !== query.value.q)
      navigate({ ...query.value, q: search.value }, 1, true);
  }, 300);
}
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
});
// Sur mobile, la recherche est dans la barre du haut « pilule » (P5b.4, E4).
useTopBarSearch(() =>
  smAndDown.value
    ? {
        value: search.value,
        placeholder: t('media.series.filters.search_placeholder'),
        onInput: onSearch,
      }
    : null,
);

const statusItems = computed(() =>
  SERIES_LIBRARY_STATUSES.map((value) => ({
    value,
    title: t(`media.series.filters.status.${value}`),
  })),
);
const statusOptions = computed(() =>
  statusItems.value.map((item) => ({ value: item.value, label: item.title })),
);
function setStatus(value: SeriesLibraryStatus | null | undefined): void {
  patch({ status: value ?? 'all' });
}

// Panneau des filtres (mobile) : brouillon appliqué par « Appliquer ».
const filtersOpen = ref(false);
const draft = reactive<SeriesLibraryQuery>({ ...DEFAULT_SERIES_LIBRARY_QUERY });
watch(filtersOpen, (open) => {
  if (open) Object.assign(draft, query.value, { q: search.value.trim() });
});
function applyDraft(): void {
  filtersOpen.value = false;
  navigate({ ...draft });
}
function resetFromSheet(): void {
  filtersOpen.value = false;
  resetFilters();
}
const filterCount = computed(() => seriesFilterCount(query.value));
const activeFilter = computed(() => hasActiveSeriesFilter(query.value));

// ── Vues ────────────────────────────────────────────────────────────────────

// Préférence du compte à chaque ouverture ; un changement ne vaut que pour la visite.
const viewMode = ref<ViewMode>(initialViewMode(session.userPreferences.seriesView, mdAndUp.value));
const VIEW_ICONS: Record<ViewMode, string> = {
  grid: msGridViewFill,
  wall: msViewModule,
  extended: msViewAgenda,
  table: msViewList,
  shelf: msShelves,
};
const viewOptions = computed(() =>
  VIEW_MODES.map((mode) => ({
    value: mode,
    icon: VIEW_ICONS[mode],
    label: t(`media.series.view.${mode}`),
  })),
);

// ── Bannière d'action ───────────────────────────────────────────────────────

interface Banner {
  type: 'info' | 'success' | 'warning' | 'error';
  text: string;
}
const banner = ref<Banner | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
function showBanner(type: Banner['type'], text: string): void {
  clearTimeout(bannerTimer);
  banner.value = { type, text };
  // Les bilans s'effacent après 6 s ; un suivi en cours reste affiché.
  if (type !== 'info') bannerTimer = setTimeout(() => (banner.value = null), 6_000);
}
onBeforeUnmount(() => {
  clearTimeout(bannerTimer);
});

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK') return t('media.series.warnings.network_error');
    if (error.code === 'SERVICE_UNREACHABLE') return t('media.api.sonarr_unreachable');
  }
  return t('media.series.detail.unknown_error');
}

const refreshLibrary = () =>
  queryClient.invalidateQueries({ queryKey: [...seriesKeys.all(slug.value), 'library'] });

// ── Fiche : page `/medias/:slug/series/:id` (D130) ──────────────────────────

const addOpen = ref(false);
// FAB du service (barre basse, mobile) : `?action=add`.
useFabQueryAction('add', () => (addOpen.value = true));

// Tirer pour rafraîchir (mobile).
const pulling = ref(false);
async function pullRefresh(): Promise<void> {
  pulling.value = true;
  try {
    await Promise.all([library.refetch(), warnings.refetch()]);
  } finally {
    pulling.value = false;
  }
}

function openSeries(id: number): void {
  void router.push({ name: 'sonarr-series', params: { slug: slug.value, id: String(id) } });
}
// Retour d'une fiche dont la série a été retirée : bannière (état de l'historique).
onMounted(() => {
  const state = router.options.history.state as { removedSeries?: unknown } | null;
  if (typeof state?.removedSeries === 'string') {
    showBanner('success', t('media.series.warnings.delete_ok_tpl', { count: 1 }));
    void refreshLibrary();
  }
});
/** Séries sorties de la file : bibliothèque et fiches relues (`refreshSeriesCard` d'origine). */
function onLeftQueue(seriesIds: number[]): void {
  void refreshLibrary();
  for (const id of seriesIds) {
    void queryClient.invalidateQueries({ queryKey: seriesKeys.series(slug.value, id) });
  }
}

/** Marque-page des cartes : bascule le suivi sans ouvrir la fiche. */
async function toggleMonitor(id: number): Promise<void> {
  const entry = items.value.find((item) => item.id === id);
  if (entry === undefined) return;
  try {
    await seriesApi.monitor(slug.value, id, !entry.monitored);
    await refreshLibrary();
  } catch (error) {
    showBanner('error', errorText(error));
  }
}

// ── Commandes de l'instance ─────────────────────────────────────────────────

const busy = reactive({
  refreshAll: false,
  rss: false,
  refreshFiltered: false,
  searchFiltered: false,
});

/** Suit une commande et affiche son bilan (`pollCmd` d'origine). */
async function followCommand(cmdId: number, label: string, isSearch: boolean): Promise<boolean> {
  showBanner('info', t('media.series.warnings.cmd_in_progress_tpl', { label }));
  const result = await commands.follow(slug.value, cmdId, ({ status, elapsed }) => {
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

async function runInstanceCommand(kind: 'refreshAll' | 'rss'): Promise<void> {
  const label = t(
    kind === 'rss' ? 'media.series.warnings.rss_label' : 'media.series.warnings.refresh_label',
  );
  busy[kind] = true;
  try {
    const started = await (kind === 'rss' ? seriesApi.rssSync : seriesApi.refreshAll)(slug.value);
    busy[kind] = false;
    if (started.cmdId === null) {
      showBanner('error', t('media.series.warnings.generic_error'));
      return;
    }
    const done = await followCommand(started.cmdId, label, false);
    if (done && kind === 'refreshAll') void refreshLibrary();
  } catch (error) {
    busy[kind] = false;
    showBanner('error', errorText(error));
  }
}

// ── Actions sur tout le filtre ──────────────────────────────────────────────

/** Une requête par série, quatre à la fois ; les échecs comptent comme terminés (original). */
async function eachSeries(ids: number[], run: (id: number) => Promise<unknown>): Promise<void> {
  await mapLimit(ids, 4, (id) => run(id).catch(() => undefined));
}

async function refreshFiltered(): Promise<void> {
  busy.refreshFiltered = true;
  showBanner('info', t('media.series.warnings.resolving_filter'));
  try {
    const { ids } = await seriesApi.filteredIds(slug.value, query.value);
    if (ids.length === 0) {
      showBanner('warning', t('media.series.warnings.no_filter_match'));
      return;
    }
    showBanner('info', t('media.series.warnings.refreshing_tpl', { count: ids.length }));
    await eachSeries(ids, (id) => seriesApi.refresh(slug.value, id));
    showBanner('success', t('media.series.warnings.refresh_tpl', { count: ids.length }));
  } catch {
    showBanner('error', t('media.series.warnings.network_error'));
  } finally {
    busy.refreshFiltered = false;
  }
}

const searchConfirm = reactive({ open: false, ids: [] as number[] });
const searchRunning = ref(false);

async function prepareSearchFiltered(): Promise<void> {
  busy.searchFiltered = true;
  showBanner('info', t('media.series.warnings.resolving_filter'));
  try {
    const { ids } = await seriesApi.filteredIds(slug.value, query.value, true);
    if (ids.length === 0) {
      showBanner('warning', t('media.series.warnings.no_monitored_filtered'));
      busy.searchFiltered = false;
      return;
    }
    banner.value = null;
    searchConfirm.ids = ids;
    searchConfirm.open = true;
  } catch {
    busy.searchFiltered = false;
    showBanner('error', t('media.series.warnings.network_error'));
  }
}
watch(
  () => searchConfirm.open,
  (open) => {
    if (!open && !searchRunning.value) busy.searchFiltered = false;
  },
);

async function searchFiltered(): Promise<void> {
  const ids = searchConfirm.ids;
  searchRunning.value = true;
  showBanner('info', t('media.series.warnings.searching_tpl', { count: ids.length }));
  try {
    await eachSeries(ids, (id) => seriesApi.search(slug.value, id));
    showBanner('success', t('media.series.warnings.search_launched_tpl', { count: ids.length }));
  } finally {
    searchRunning.value = false;
    busy.searchFiltered = false;
  }
}

// ── Sélection et actions en masse ───────────────────────────────────────────

const selectMode = ref(false);
const selected = ref<Set<number>>(new Set());
let anchor: number | null = null;
const orderedIds = computed(() => items.value.map((entry) => entry.id));

function clearSelection(): void {
  selected.value = new Set();
  anchor = null;
}
function toggleSelectMode(): void {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) clearSelection();
}
function onSelect(id: number, event: MouseEvent | KeyboardEvent): void {
  selected.value = toggleSelection(selected.value, orderedIds.value, id, anchor, event.shiftKey);
  if (!event.shiftKey || anchor === null) anchor = id;
}
function selectAll(): void {
  selected.value = new Set(orderedIds.value);
}
/** Appui long sur une série (mobile) : entre en sélection avec cette série. */
function startSelection(id: number): void {
  if (!selectMode.value) selectMode.value = true;
  selected.value = new Set([...selected.value, id]);
  anchor = id;
}
watch(() => apiParams.value.toString(), clearSelection);

const selectedIds = computed(() => orderedIds.value.filter((id) => selected.value.has(id)));
const selectedTitles = computed(() =>
  items.value
    .filter((entry) => selected.value.has(entry.id))
    .map((entry) => (entry.year === null ? entry.title : `${entry.title} (${entry.year})`)),
);

const dialogs = reactive({ edit: false, tags: false, delete: false, rename: false });
const saving = ref(false);
function openDialog(name: 'edit' | 'tags' | 'delete' | 'rename'): void {
  if (selectedIds.value.length === 0) return;
  if (name === 'edit' || name === 'tags') configWanted.value = true;
  dialogs[name] = true;
}

async function bulkMutation(
  run: () => Promise<unknown>,
  success: string,
  close: () => void,
  failure: (error: unknown) => string,
): Promise<void> {
  saving.value = true;
  try {
    await run();
    close();
    clearSelection();
    showBanner('success', success);
    await refreshLibrary();
  } catch (error) {
    close();
    showBanner('error', failure(error));
  } finally {
    saving.value = false;
  }
}

function saveEdit(changes: Omit<SeriesBulkEditRequest, 'seriesIds'>): void {
  const seriesIds = selectedIds.value;
  void bulkMutation(
    () => seriesApi.bulkEdit(slug.value, { seriesIds, ...changes }),
    t('media.series.warnings.modified_ok_tpl', { count: seriesIds.length }),
    () => (dialogs.edit = false),
    (error) => t('media.series.warnings.error_tpl', { error: errorText(error) }),
  );
}
function saveTags(tags: number[], applyTags: ApplyTagsMode): void {
  const seriesIds = selectedIds.value;
  void bulkMutation(
    () => seriesApi.bulkEdit(slug.value, { seriesIds, tags, applyTags }),
    t('media.series.warnings.tags_ok_tpl', { count: seriesIds.length }),
    () => (dialogs.tags = false),
    () => t('media.series.warnings.bulk_error'),
  );
}
const selectedForRename = computed(() =>
  items.value
    .filter((entry) => selected.value.has(entry.id))
    .map((entry) => ({ id: entry.id, title: entry.title })),
);
const RENAME_KEYS = {
  title: 'media.series.bulk.rename_title',
  loading: 'media.series.bulk.rename_loading',
  correct: 'media.series.bulk.already_correct_tpl',
  allCorrect: 'media.series.bulk.all_correct',
  organise: 'media.series.bulk.organise_files_tpl',
  cancel: 'media.series.bulk.cancel',
};
/** Renommage de toute la série (`RenameSeries`, aucun fichier désigné), comme l'original. */
const renameSeries = (id: number) => seriesApi.rename(slug.value, id, []);
const previewRename = (id: number) => seriesApi.renamePreview(slug.value, id);
function onRenamed(count: number): void {
  clearSelection();
  showBanner('success', t('media.series.warnings.rename_ok_tpl', { count }));
}

function confirmDelete(deleteFiles: boolean, addImportExclusion: boolean): void {
  const seriesIds = selectedIds.value;
  void bulkMutation(
    () => seriesApi.bulkDelete(slug.value, { seriesIds, deleteFiles, addImportExclusion }),
    t('media.series.warnings.delete_ok_tpl', { count: seriesIds.length }),
    () => (dialogs.delete = false),
    () => t('media.series.warnings.bulk_error'),
  );
}

// ── Reprise des commandes en cours au chargement (`commands/active`) ────────

async function resumeActiveCommands(): Promise<void> {
  let active: Awaited<ReturnType<typeof seriesApi.activeCommands>>;
  try {
    active = await seriesApi.activeCommands(slug.value);
  } catch {
    return;
  }
  for (const command of active) {
    const key = SERIES_TRACKED_COMMANDS[command.name];
    if (key === undefined || command.id <= 0) continue;
    void followCommand(command.id, t(key), command.name !== 'RenameFiles');
  }
}
void resumeActiveCommands();
</script>

<template>
  <v-container fluid class="series-view" :class="{ 'series-view--selecting': selectMode }">
    <ServiceDownBanner service="sonarr" :instance="slug" />
    <SonarrNav
      :subtitle="data ? t('media.series.header_count', { count: data.stats.total }) : null"
    >
      <v-btn
        v-if="mdAndUp"
        v-write
        :prepend-icon="msAdd"
        color="service"
        variant="flat"
        size="small"
        data-test="series-add"
        @click="addOpen = true"
        >{{ t('media.series.actions.add') }}</v-btn
      >
      <v-menu location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-write
            v-bind="menuProps"
            :icon="msMoreVert"
            size="small"
            variant="text"
            :loading="busy.refreshAll || busy.rss"
            :aria-label="t('media.films.actions.more')"
            data-test="series-more"
          />
        </template>
        <v-list density="compact">
          <v-list-item
            :prepend-icon="msRefresh"
            :title="t('media.series.actions.refresh_all_title')"
            data-test="series-refresh-all"
            @click="runInstanceCommand('refreshAll')"
          />
          <v-list-item
            :prepend-icon="msRssFeed"
            :title="t('media.series.actions.rss_sync')"
            @click="runInstanceCommand('rss')"
          />
        </v-list>
      </v-menu>
    </SonarrNav>

    <EmptyState
      v-if="library.isError.value && data === undefined && !unreachable"
      :title="t('error.generic.message')"
    >
      <v-btn variant="tonal" @click="library.refetch()">{{ t('common.action.retry') }}</v-btn>
    </EmptyState>

    <template v-if="data !== undefined">
      <!-- Statistiques de toute la bibliothèque : tuiles sur grand écran, une ligne sur mobile (F1) -->
      <div v-if="mdAndUp" class="series-stats mb-3" data-test="series-stats">
        <StatTile :value="data.stats.total" :label="t('media.series.stats.total')" />
        <StatTile
          :value="data.stats.continuing"
          :label="t('media.series.stats.continuing')"
          color="success"
        />
        <StatTile :value="data.stats.ended" :label="t('media.series.stats.ended')" />
        <StatTile
          :value="gbParts(data.stats.totalGb).value"
          :unit="gbParts(data.stats.totalGb).unit"
          :label="t('media.series.stats.total_size')"
        />
      </div>
      <MetaLine v-else class="mb-2" data-test="series-stats">
        <span
          ><strong>{{ data.stats.continuing }}</strong>
          {{ t('media.series.stats.continuing') }}</span
        >
        <span
          ><strong>{{ data.stats.ended }}</strong> {{ t('media.series.stats.ended') }}</span
        >
        <span>{{ formatGb(data.stats.totalGb) }}</span>
      </MetaLine>

      <SeriesQueuePanel :slug="slug" @left="onLeftQueue" @notice="showBanner" />

      <!-- Alertes de santé, fermables une par une (P5d.5, V30) -->
      <v-alert
        v-for="text in visibleWarnings"
        :key="text"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-2"
        closable
        :close-label="t('common.ds.dismiss_alert')"
        data-test="series-warning"
        @click:close="alerts.dismiss(text)"
        >{{ text }}</v-alert
      >
      <v-alert
        v-if="banner"
        :type="banner.type"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-test="series-banner"
      >
        <div class="d-flex align-center ga-2">
          <v-progress-circular v-if="banner.type === 'info'" indeterminate size="16" width="2" />
          <span>{{ banner.text }}</span>
        </div>
      </v-alert>

      <!-- Barre d'outils -->
      <div class="series-toolbar mb-2">
        <v-filter-field
          v-if="mdAndUp"
          :model-value="search"
          :prepend-inner-icon="msSearch"
          :placeholder="t('media.series.filters.search_placeholder')"
          :aria-label="t('media.series.filters.search_placeholder')"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="series-toolbar__search"
          data-test="series-search"
          @update:model-value="onSearch"
        />
        <FilterChips
          :model-value="query.status"
          :options="statusOptions"
          test-prefix="status"
          class="series-toolbar__status"
          @update:model-value="setStatus"
        />
        <div class="series-toolbar__actions">
          <v-badge
            v-if="!mdAndUp"
            :content="filterCount"
            :model-value="filterCount > 0"
            color="service"
          >
            <v-btn
              :icon="msFilterList"
              variant="text"
              size="small"
              :aria-label="t('media.series.filters.open')"
              :title="t('media.series.filters.open')"
              data-test="series-filters-open"
              @click="filtersOpen = true"
            />
          </v-badge>
          <ViewModeMenu
            v-model="viewMode"
            :options="viewOptions"
            :label="t('common.view_mode')"
            test-id="series-view"
          />
          <v-btn
            v-if="mdAndUp"
            v-write
            :prepend-icon="selectMode ? msClose : msCheckBox"
            size="small"
            :variant="selectMode ? 'flat' : 'outlined'"
            :color="selectMode ? 'service' : undefined"
            data-test="series-select-mode"
            @click="toggleSelectMode"
            >{{
              selectMode ? t('media.series.bulk.cancel') : t('media.series.actions.select_mode')
            }}</v-btn
          >
          <v-btn
            v-else
            v-write
            :icon="selectMode ? msClose : msCheckBox"
            size="small"
            :variant="selectMode ? 'flat' : 'text'"
            :color="selectMode ? 'service' : undefined"
            :aria-label="
              selectMode ? t('media.series.bulk.cancel') : t('media.series.actions.select_mode')
            "
            :aria-pressed="selectMode"
            data-test="series-select-mode"
            @click="toggleSelectMode"
          />
        </div>
      </div>
      <SeriesFilters v-if="mdAndUp" :query="query" :facets="facets" class="mb-2" @change="patch" />

      <!-- Actions sur tout le filtre -->
      <div v-if="activeFilter || query.q !== ''" class="d-flex flex-wrap align-center ga-2 mb-2">
        <template v-if="activeFilter">
          <v-btn
            v-write
            :prepend-icon="msRefresh"
            size="small"
            variant="tonal"
            color="service-text"
            :loading="busy.refreshFiltered"
            :title="t('media.series.actions.refresh_filtered_title')"
            data-test="refresh-filtered"
            @click="refreshFiltered"
            >{{ t('media.series.actions.refresh_filtered') }}</v-btn
          >
          <v-btn
            v-write
            :prepend-icon="msSearch"
            size="small"
            variant="tonal"
            color="warning"
            :loading="busy.searchFiltered"
            :title="t('media.series.actions.search_filtered_title')"
            data-test="search-filtered"
            @click="prepareSearchFiltered"
            >{{ t('media.series.actions.search_filtered') }}</v-btn
          >
        </template>
        <v-spacer />
        <v-btn size="small" variant="text" data-test="reset-filters" @click="resetFilters">{{
          t('media.series.pagination.reset_filters')
        }}</v-btn>
      </div>

      <LibraryPagination
        :page="data.page"
        :total-pages="data.totalPages"
        :total="data.total"
        :library-total="data.libraryTotal"
        :per-page="data.perPage"
        i18n-prefix="media.series.pagination"
        @update:page="goToPage"
      />

      <!-- Liste -->
      <PullToRefresh :loading="pulling" :disabled="selectMode" @refresh="pullRefresh">
        <div
          class="series-content"
          :class="{ 'series-content--loading': library.isPlaceholderData.value }"
          data-test="series-content"
        >
          <div
            v-if="viewMode === 'grid' || viewMode === 'wall'"
            :class="viewMode === 'wall' ? 'series-wall' : 'series-grid'"
          >
            <SeriesCard
              v-for="entry in items"
              :key="entry.id"
              v-long-press="() => startSelection(entry.id)"
              :series="entry"
              :select-mode="selectMode"
              :selected="selected.has(entry.id)"
              :compact="viewMode === 'wall'"
              :subtitle="subtitles.statusOf(entry.id)"
              :watched-episodes="watchedCount(showEpisodes(watched, { tvdbId: entry.tvdbId }))"
              @select="onSelect(entry.id, $event)"
              @open="openSeries(entry.id)"
              @monitor="toggleMonitor(entry.id)"
            />
          </div>
          <v-card v-else-if="viewMode === 'extended'" variant="flat" class="series-list">
            <SeriesListItem
              v-for="entry in items"
              :key="entry.id"
              v-long-press="() => startSelection(entry.id)"
              :series="entry"
              :select-mode="selectMode"
              :selected="selected.has(entry.id)"
              :watched-episodes="watchedCount(showEpisodes(watched, { tvdbId: entry.tvdbId }))"
              @select="onSelect(entry.id, $event)"
              @open="openSeries(entry.id)"
              @monitor="toggleMonitor(entry.id)"
            />
          </v-card>
          <SeriesTable
            v-else-if="viewMode === 'table'"
            :series="items"
            :select-mode="selectMode"
            :selected="selected"
            @select="onSelect"
            @open="openSeries"
          />
          <SeriesShelves
            v-else
            :series="items"
            :select-mode="selectMode"
            :selected="selected"
            @select="onSelect"
            @open="openSeries"
            @monitor="toggleMonitor"
          />
        </div>
      </PullToRefresh>

      <LibraryPagination
        v-if="data.totalPages > 1"
        :page="data.page"
        :total-pages="data.totalPages"
        :total="data.total"
        :library-total="data.libraryTotal"
        :per-page="data.perPage"
        i18n-prefix="media.series.pagination"
        @update:page="goToPage"
      />
    </template>
    <div v-else-if="library.isPending.value" class="d-flex justify-center pa-8">
      <v-progress-circular indeterminate color="service" />
    </div>

    <!-- Barre de sélection -->
    <BulkActionBar
      v-if="selectMode"
      :count="selectedIds.length"
      :select-all-label="t('media.series.bulk.select_all')"
      @clear="toggleSelectMode"
      @select-all="selectAll"
    >
      <v-btn
        v-write
        size="small"
        variant="tonal"
        data-test="bulk-edit"
        @click="openDialog('edit')"
        >{{ t('media.series.bulk.edit') }}</v-btn
      >
      <v-btn
        v-write
        size="small"
        variant="tonal"
        data-test="bulk-tags"
        @click="openDialog('tags')"
        >{{ t('media.series.bulk.tags') }}</v-btn
      >
      <v-btn
        v-write
        size="small"
        variant="tonal"
        data-test="bulk-rename"
        @click="openDialog('rename')"
        >{{ t('media.series.bulk.rename') }}</v-btn
      >
      <v-btn
        v-write
        size="small"
        variant="tonal"
        color="error"
        data-test="bulk-delete"
        @click="openDialog('delete')"
        >{{ t('media.series.bulk.delete') }}</v-btn
      >
    </BulkActionBar>

    <!-- Panneau des filtres (mobile) -->
    <ResponsiveDialog v-model="filtersOpen" :title="t('media.series.filters.drawer_title')">
      <v-select
        v-model="draft.status"
        :items="statusItems"
        :label="t('media.series.table.status')"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-2"
      />
      <SeriesFilters
        :query="draft"
        :facets="facets"
        stacked
        @change="(change) => Object.assign(draft, change)"
      />
      <template #actions>
        <v-btn variant="text" @click="resetFromSheet">{{
          t('media.series.pagination.reset_filters')
        }}</v-btn>
        <v-btn
          color="service"
          variant="flat"
          data-test="series-filters-apply"
          @click="applyDraft"
          >{{ t('media.series.filters.apply') }}</v-btn
        >
      </template>
    </ResponsiveDialog>

    <SeriesBulkEditDialog
      v-model="dialogs.edit"
      :count="selectedIds.length"
      :config="config.data.value"
      :loading="saving"
      @save="saveEdit"
    />
    <BulkTagsDialog
      v-model="dialogs.tags"
      :count="selectedIds.length"
      :tags="config.data.value?.tags"
      :loading="saving"
      i18n-prefix="media.series.bulk"
      @save="saveTags"
    />
    <BulkDeleteDialog
      v-model="dialogs.delete"
      :titles="selectedTitles"
      :loading="saving"
      i18n-prefix="media.series.bulk"
      @confirm="confirmDelete"
    />
    <BulkRenameDialog
      v-model="dialogs.rename"
      :items="selectedForRename"
      :preview="previewRename"
      :run="renameSeries"
      :keys="RENAME_KEYS"
      @done="onRenamed"
      @failed="showBanner('error', t('media.series.warnings.generic_error'))"
    />
    <AddMediaDialog
      v-model="addOpen"
      kind="series"
      :slug="slug"
      :default-quality-profile-id="data?.defaultQualityProfileId ?? null"
      @added="refreshLibrary"
    />
    <ConfirmDialog
      v-model="searchConfirm.open"
      :message="
        t('media.series.warnings.confirm_search_filtered_tpl', { count: searchConfirm.ids.length })
      "
      :confirm-label="t('media.series.actions.search_filtered')"
      @confirm="searchFiltered"
    />
  </v-container>
</template>

<style scoped>
.series-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.series-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.series-toolbar__search {
  flex: 1 1 220px;
  max-width: 320px;
}
.series-toolbar__status {
  flex: 1 1 auto;
}
.series-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
@media (max-width: 599px) {
  .series-toolbar__search {
    max-width: none;
    flex-basis: 100%;
  }
  .series-toolbar__status {
    flex: 1 1 0;
    min-width: 0;
  }
  .series-toolbar__actions {
    flex-wrap: nowrap;
  }
}
.series-content {
  transition: opacity 0.15s;
}
.series-view--selecting .series-content {
  user-select: none;
}
.series-content--loading {
  opacity: 0.5;
}
.series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px 16px;
}
.series-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}
@media (max-width: 599px) {
  .series-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 12px 10px;
  }
}
.series-list {
  margin: 0 -16px;
  background: transparent;
}
</style>
