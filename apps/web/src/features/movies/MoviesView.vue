<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Bibliothèque de films d'une instance Radarr (`media/films.html.twig`, P2.3) :
// statistiques, avertissements, recherche et filtres (dans l'URL), 5 vues,
// pagination, actions filtrées, commandes suivies, sélection et actions en masse.
//
// La fiche d'un film s'ouvre par `?open=<id>` (MovieDetailDialog, P2.4).
// File d'attente (QueuePanel, P2.7) sous les statistiques. Reporté : badge des
// sous-titres (P3c.4). Mobile (P5b.4) : recherche dans la barre du haut, ajout
// par le FAB du service, appui long pour sélectionner, tirer pour rafraîchir.
import { useDismissedAlerts } from '../../app/dismissed-alerts';
import { formatGb, gbParts } from '../../app/format';
import {
  DEFAULT_MOVIE_LIBRARY_QUERY,
  MOVIE_LIBRARY_STATUSES,
  hasActiveLibraryFilter,
  libraryFilterCount,
  type ApplyTagsMode,
  type LibraryWarning,
  type MovieLibraryQuery,
  type MovieLibraryStatus,
  type MoviesBulkEditRequest,
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
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import LibraryPagination from '../../components/LibraryPagination.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import BulkActionBar from '../../components/ds/BulkActionBar.vue';
import FilterChips from '../../components/ds/FilterChips.vue';
import MetaLine from '../../components/ds/MetaLine.vue';
import PullToRefresh from '../../components/ds/PullToRefresh.vue';
import StatTile from '../../components/ds/StatTile.vue';
import AddMediaDialog from '../add-media/AddMediaDialog.vue';
import BulkDeleteDialog from '../../components/BulkDeleteDialog.vue';
import BulkRenameDialog from '../../components/BulkRenameDialog.vue';
import BulkEditDialog from './BulkEditDialog.vue';
import BulkTagsDialog from '../../components/BulkTagsDialog.vue';
import { useWatched } from '../activity/watched';
import MovieCard from './MovieCard.vue';
import MovieFilters from './MovieFilters.vue';
import MovieListItem from './MovieListItem.vue';
import MovieShelves from './MovieShelves.vue';
import MovieTable from './MovieTable.vue';
import QueuePanel from './QueuePanel.vue';
import RadarrNav from './RadarrNav.vue';
import type { ImportedMovie } from './queue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { ViewModeMenu } from '../../components/ds';
import {
  apiParamsOf,
  downloadedCount,
  reportedDownloads,
  TRACKED_COMMANDS,
  queryFromRoute,
  routeQueryOf,
  searchedTitle,
  initialViewMode,
  toggleSelection,
  VIEW_MODES,
  type ViewMode,
} from './library';
import { moviesApi, moviesKeys } from './movies-api';
import { useArrCommand } from './useArrCommand';
import SubtitleSearchDialog from '../bazarr/SubtitleSearchDialog.vue';
import { useSubtitleStatuses } from '../bazarr/bazarr-api';
import { vWrite } from '../../app/access';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const queryClient = useQueryClient();
const { mdAndUp, smAndDown } = useDisplay();
const commands = useArrCommand();
const subtitles = useSubtitleStatuses('movie');
const watched = useWatched();
const subtitleSearch = reactive<{ open: boolean; id: number | null }>({ open: false, id: null });

const slug = computed(() => String(route.params.slug ?? ''));
const defaultPerPage = computed(() => Number(session.preferences.display_page_size));
const query = computed(() => queryFromRoute(route.query, defaultPerPage.value));
// L'ancien lien profond `?open=` mène à la page du film (redirection du routeur).
const apiParams = computed(() => apiParamsOf(query.value));

// ── Données ─────────────────────────────────────────────────────────────────

const library = useQuery({
  queryKey: computed(() => moviesKeys.library(slug.value, apiParams.value.toString())),
  queryFn: ({ signal }) => moviesApi.library(slug.value, apiParams.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const warnings = useQuery({
  queryKey: computed(() => moviesKeys.warnings(slug.value)),
  queryFn: ({ signal }) => moviesApi.warnings(slug.value, signal),
  // Relus toutes les 10 s, comme le bandeau d'origine.
  refetchInterval: 10_000,
  retry: false,
});
const configWanted = ref(false);
const config = useQuery({
  queryKey: computed(() => moviesKeys.config(slug.value)),
  queryFn: ({ signal }) => moviesApi.config(slug.value, signal),
  enabled: configWanted,
  staleTime: 60_000,
});

const data = computed(() => library.data.value);
const items = computed(() => data.value?.items ?? []);
const facets = computed(() => data.value?.facets ?? { genres: [], qualities: [], languages: [] });
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
const alerts = useDismissedAlerts(() => `radarr.${slug.value}`, warningTexts);
const visibleWarnings = computed(() =>
  (warningTexts.value ?? []).filter((text) => alerts.isVisible(text)),
);

// ── Navigation des filtres (l'URL est la source de vérité) ─────────────────

function navigate(next: MovieLibraryQuery, page = 1, replace = false): void {
  const location = { query: routeQueryOf(next, defaultPerPage.value, page) };
  void (replace ? router.replace(location) : router.push(location));
}
function patch(change: Partial<MovieLibraryQuery>): void {
  navigate({ ...query.value, ...change });
}
function goToPage(page: number): void {
  navigate(query.value, page);
}
function resetFilters(): void {
  navigate({ ...DEFAULT_MOVIE_LIBRARY_QUERY, perPage: query.value.perPage });
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
// Sur mobile, la recherche est dans la barre du haut « pilule » (E4).
useTopBarSearch(() =>
  smAndDown.value
    ? {
        value: search.value,
        placeholder: t('media.films.filters.search_placeholder'),
        onInput: onSearch,
      }
    : null,
);

const statusItems = computed(() =>
  MOVIE_LIBRARY_STATUSES.map((value) => ({
    value,
    title: t(`media.films.filters.status.${value}`),
  })),
);
const statusOptions = computed(() =>
  statusItems.value.map((item) => ({ value: item.value, label: item.title })),
);
function setStatus(value: MovieLibraryStatus | null | undefined): void {
  patch({ status: value ?? 'all' });
}

// Panneau des filtres (mobile) : brouillon appliqué par « Appliquer » ; fermé
// sans appliquer, il est abandonné et l'URL reste inchangée.
const filtersOpen = ref(false);
const draft = reactive<MovieLibraryQuery>({ ...DEFAULT_MOVIE_LIBRARY_QUERY });
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
const filterCount = computed(() => libraryFilterCount(query.value));
const activeFilter = computed(() => hasActiveLibraryFilter(query.value));

// ── Vues ────────────────────────────────────────────────────────────────────

// Préférence du compte à chaque ouverture ; un changement ne vaut que pour la visite.
const viewMode = ref<ViewMode>(initialViewMode(session.userPreferences.moviesView, mdAndUp.value));
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
    label: t(`media.films.view.${mode}`),
  })),
);

// ── Bannière d'action (`warnings-banner` d'origine) ─────────────────────────

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
    if (error.code === 'NETWORK') return t('media.films.warnings_network_error');
    if (error.code === 'SERVICE_UNREACHABLE') return t('media.api.radarr_unreachable');
  }
  return t('media.films.detail.unknown_error');
}

const refreshLibrary = () =>
  queryClient.invalidateQueries({ queryKey: [...moviesKeys.all(slug.value), 'library'] });

// ── Fiche film : page `/medias/:slug/films/:id` (D130) ──────────────────────

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

function openMovie(id: number): void {
  void router.push({ name: 'radarr-movie', params: { slug: slug.value, id: String(id) } });
}
// Retour d'une fiche dont le film a été retiré : bannière (état de l'historique).
onMounted(() => {
  const state = router.options.history.state as { removedMovie?: unknown } | null;
  if (typeof state?.removedMovie === 'string') {
    showBanner('success', t('media.films.warnings_bulk_delete_ok', { count: 1 }));
    void refreshLibrary();
  }
});

/** Marque-page des cartes : bascule le suivi sans ouvrir la fiche. */
async function toggleMonitor(id: number): Promise<void> {
  const movie = items.value.find((item) => item.id === id);
  if (movie === undefined) return;
  try {
    await moviesApi.monitor(slug.value, id, !movie.monitored);
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

async function runInstanceCommand(kind: 'refreshAll' | 'rss'): Promise<void> {
  const label = t(
    kind === 'rss' ? 'media.films.warnings_rss_label' : 'media.films.warnings_refresh_label',
  );
  busy[kind] = true;
  try {
    const started = await (kind === 'rss' ? moviesApi.rssSync : moviesApi.refreshAll)(slug.value);
    busy[kind] = false;
    if (started.cmdId === null) {
      showBanner('error', t('media.films.warnings_generic_error'));
      return;
    }
    showBanner('info', t('media.films.warnings_cmd_in_progress', { label }));
    const result = await commands.follow(slug.value, started.cmdId, ({ status, elapsed }) => {
      const msg =
        status.message ??
        t('media.films.warnings_search_in_progress_elapsed', { seconds: elapsed });
      showBanner('info', t('media.films.warnings_cmd_elapsed', { label, msg }));
    });
    if (result.outcome === 'completed') {
      showBanner('success', t('media.films.warnings_cmd_done', { label }));
      if (kind === 'refreshAll') void refreshLibrary();
    } else if (result.outcome === 'failed') {
      const error = result.status.message ?? t('media.films.detail.unknown_error');
      showBanner('error', t('media.films.warnings_cmd_failed', { label, error }));
    }
  } catch (error) {
    busy[kind] = false;
    showBanner('error', errorText(error));
  }
}

// ── Actions sur tout le filtre ──────────────────────────────────────────────

async function refreshFiltered(): Promise<void> {
  busy.refreshFiltered = true;
  showBanner('info', t('media.films.warnings_resolving_filter'));
  try {
    const { ids } = await moviesApi.filteredIds(slug.value, query.value);
    if (ids.length === 0) {
      showBanner('warning', t('media.films.warnings_no_filter_match'));
      return;
    }
    await moviesApi.bulkRefresh(slug.value, ids);
    showBanner('success', t('media.films.warnings_update', { count: ids.length }));
  } catch (error) {
    showBanner('error', t('media.films.warnings_update_error', { error: errorText(error) }));
  } finally {
    busy.refreshFiltered = false;
  }
}

const searchConfirm = reactive({ open: false, ids: [] as number[] });

async function prepareSearchFiltered(): Promise<void> {
  busy.searchFiltered = true;
  try {
    const { ids } = await moviesApi.filteredIds(slug.value, query.value, true);
    if (ids.length === 0) {
      showBanner('warning', t('media.films.warnings_no_missing_filter'));
      busy.searchFiltered = false;
      return;
    }
    searchConfirm.ids = ids;
    searchConfirm.open = true;
  } catch {
    busy.searchFiltered = false;
    showBanner('error', t('media.films.warnings_network_error'));
  }
}
watch(
  () => searchConfirm.open,
  (open) => {
    // Annulation : le bouton redevient disponible.
    if (!open && !searchRunning.value) busy.searchFiltered = false;
  },
);

const searchRunning = ref(false);
async function searchFiltered(): Promise<void> {
  const ids = searchConfirm.ids;
  const total = ids.length;
  searchRunning.value = true;
  showBanner(
    'info',
    t('media.films.warnings_search_progress', {
      count: total,
      indexers: warnings.data.value?.indexerCount ?? 0,
    }),
  );
  try {
    const started = await moviesApi.bulkSearch(slug.value, ids);
    if (started.cmdId === null) {
      showBanner(
        'error',
        t('media.films.warnings_search_error_pr', { error: t('media.films.detail.unknown_error') }),
      );
      return;
    }
    let lastTitle = '';
    let done = 0;
    const result = await commands.follow(slug.value, started.cmdId, ({ status, elapsed }) => {
      const message = status.message ?? '';
      const title = searchedTitle(message);
      if (title !== null && title !== lastTitle) {
        lastTitle = title;
        done += 1;
      }
      const progress =
        done > 0 ? t('media.films.warnings_search_progress_suffix', { done, total }) : '';
      const msg =
        message || t('media.films.warnings_search_in_progress_elapsed', { seconds: elapsed });
      showBanner('info', t('media.films.warnings_search_elapsed', { msg, progress }));
    });
    if (result.outcome === 'completed') {
      const dl = downloadedCount(result.status.message ?? '');
      showBanner(
        dl > 0 ? 'success' : 'warning',
        dl > 0
          ? t('media.films.warnings_search_dl', { dl, total })
          : t('media.films.warnings_search_none', { total }),
      );
    } else if (result.outcome === 'failed') {
      const error = result.status.message ?? t('media.films.detail.unknown_error');
      showBanner('error', t('media.films.warnings_search_failed', { error }));
    }
  } catch (error) {
    showBanner('error', t('media.films.warnings_search_error_pr', { error: errorText(error) }));
  } finally {
    searchRunning.value = false;
    busy.searchFiltered = false;
  }
}

// ── Sélection et actions en masse ───────────────────────────────────────────

const selectMode = ref(false);
const selected = ref<Set<number>>(new Set());
let anchor: number | null = null;
const orderedIds = computed(() => items.value.map((movie) => movie.id));

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
/** Appui long sur un film (mobile) : entre en sélection avec ce film. */
function startSelection(id: number): void {
  if (!selectMode.value) selectMode.value = true;
  selected.value = new Set([...selected.value, id]);
  anchor = id;
}
// La sélection vaut pour la page affichée (comme l'original, rechargé à chaque filtre).
watch(() => apiParams.value.toString(), clearSelection);

const selectedIds = computed(() => orderedIds.value.filter((id) => selected.value.has(id)));
const selectedTitles = computed(() =>
  items.value
    .filter((movie) => selected.value.has(movie.id))
    .map((movie) => (movie.year === null ? movie.title : `${movie.title} (${movie.year})`)),
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

function saveEdit(changes: Omit<MoviesBulkEditRequest, 'movieIds'>): void {
  const movieIds = selectedIds.value;
  void bulkMutation(
    () => moviesApi.bulkEdit(slug.value, { movieIds, ...changes }),
    t('media.films.warnings_bulk_modified', { count: movieIds.length }),
    () => (dialogs.edit = false),
    (error) => t('media.films.detail.edit_error', { error: errorText(error) }),
  );
}
function saveTags(tags: number[], applyTags: ApplyTagsMode): void {
  const movieIds = selectedIds.value;
  void bulkMutation(
    () => moviesApi.bulkEdit(slug.value, { movieIds, tags, applyTags }),
    t('media.films.warnings_bulk_tags_ok', { count: movieIds.length }),
    () => (dialogs.tags = false),
    () => t('media.films.warnings_generic_error'),
  );
}
const selectedForRename = computed(() =>
  items.value
    .filter((movie) => selected.value.has(movie.id))
    .map((movie) => ({ id: movie.id, title: movie.title })),
);
const RENAME_KEYS = {
  title: 'media.films.bulk.rename_title',
  loading: 'media.films.bulk.rename_loading',
  correct: 'media.films.bulk.films_correctly_named',
  allCorrect: 'media.films.bulk.all_correct',
  organise: 'media.films.bulk.organise_files',
  cancel: 'media.films.bulk.cancel',
};
function onRenamed(count: number): void {
  clearSelection();
  showBanner('success', t('media.films.warnings_bulk_rename_ok', { count }));
}

// ── Reprise des commandes en cours au chargement (`commands/active`) ────────

async function resumeActiveCommands(): Promise<void> {
  let active: Awaited<ReturnType<typeof moviesApi.activeCommands>>;
  try {
    active = await moviesApi.activeCommands(slug.value);
  } catch {
    return;
  }
  for (const command of active) {
    const key = TRACKED_COMMANDS[command.name];
    if (key === undefined || command.id <= 0) continue;
    void followActiveCommand(command.id, command.name, t(key));
  }
}

/** Imports manuels en cours (la file les montre « import en cours »). */
const manualImports = ref(0);

async function followActiveCommand(cmdId: number, name: string, label: string): Promise<void> {
  if (name === 'ManualImport') manualImports.value += 1;
  try {
    await trackActiveCommand(cmdId, name, label);
  } finally {
    if (name === 'ManualImport') manualImports.value -= 1;
  }
}

async function trackActiveCommand(cmdId: number, name: string, label: string): Promise<void> {
  showBanner('info', t('media.films.warnings_cmd_in_progress', { label }));
  const result = await commands.follow(slug.value, cmdId, ({ status, elapsed }) => {
    const msg =
      status.message ?? t('media.films.warnings_search_in_progress_elapsed', { seconds: elapsed });
    showBanner('info', t('media.films.warnings_cmd_elapsed', { label, msg }));
  });
  if (result.outcome === 'failed') {
    const error = result.status.message ?? t('media.films.detail.unknown_error');
    showBanner('error', t('media.films.warnings_cmd_failed', { label, error }));
    return;
  }
  if (result.outcome !== 'completed') return;
  const count = reportedDownloads(result.status.message ?? '');
  if (count !== null && count > 0) {
    showBanner('success', t('media.films.warnings_cmd_dl_ok', { label, count }));
  } else if (name === 'ManualImport') {
    showBanner('success', t('media.films.warnings_cmd_import_done'));
  } else if (count === 0) {
    showBanner('warning', t('media.films.warnings_cmd_nothing', { label }));
  } else {
    showBanner('success', t('media.films.warnings_cmd_done', { label }));
  }
}
void resumeActiveCommands();

/** Films sortis de la file : bibliothèque et fiche ouverte relues, bandeau « Importé ». */
function onImported(movies: ImportedMovie[]): void {
  void refreshLibrary();
  for (const movie of movies) {
    void queryClient.invalidateQueries({ queryKey: moviesKeys.movie(slug.value, movie.id) });
  }
  const names = movies
    .map((movie) => movie.title)
    .filter(Boolean)
    .join(', ');
  showBanner(
    'success',
    names
      ? `${t('media.films.queue.import_done_badge')} — ${names}`
      : t('media.films.queue.import_done_badge'),
  );
}

function confirmDelete(deleteFiles: boolean, addImportExclusion: boolean): void {
  const movieIds = selectedIds.value;
  void bulkMutation(
    () => moviesApi.bulkDelete(slug.value, { movieIds, deleteFiles, addImportExclusion }),
    t('media.films.warnings_bulk_delete_ok', { count: movieIds.length }),
    () => (dialogs.delete = false),
    () => t('media.films.warnings_generic_error'),
  );
}
</script>

<template>
  <v-container fluid class="movies-view" :class="{ 'movies-view--selecting': selectMode }">
    <ServiceDownBanner service="radarr" :instance="slug" />
    <RadarrNav :subtitle="data ? t('media.films.header_count', { count: data.stats.total }) : null">
      <v-btn
        v-if="mdAndUp"
        v-write
        :prepend-icon="msAdd"
        color="service"
        variant="flat"
        size="small"
        data-test="movies-add"
        @click="addOpen = true"
        >{{ t('media.films.actions.add') }}</v-btn
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
            data-test="movies-more"
          />
        </template>
        <v-list density="compact">
          <v-list-item
            :prepend-icon="msRefresh"
            :title="t('media.films.actions.refresh_all_title')"
            data-test="movies-refresh-all"
            @click="runInstanceCommand('refreshAll')"
          />
          <v-list-item
            :prepend-icon="msRssFeed"
            :title="t('media.films.actions.rss_sync')"
            data-test="movies-rss"
            @click="runInstanceCommand('rss')"
          />
        </v-list>
      </v-menu>
    </RadarrNav>

    <EmptyState
      v-if="library.isError.value && data === undefined && !unreachable"
      :title="t('error.generic.message')"
    >
      <v-btn variant="tonal" @click="library.refetch()">{{ t('common.action.retry') }}</v-btn>
    </EmptyState>

    <template v-if="data !== undefined">
      <!-- Statistiques de toute la bibliothèque : tuiles sur grand écran, une ligne sur mobile (F1) -->
      <div v-if="mdAndUp" class="movies-stats mb-3" data-test="movies-stats">
        <StatTile :value="data.stats.total" :label="t('media.films.stats.total')" />
        <StatTile
          :value="data.stats.downloaded"
          :label="t('media.films.stats.downloaded')"
          color="success"
        />
        <StatTile
          :value="data.stats.waiting"
          :label="t('media.films.stats.waiting')"
          color="warning"
        />
        <StatTile
          :value="gbParts(data.stats.totalGb).value"
          :unit="gbParts(data.stats.totalGb).unit"
          :label="t('media.films.stats.total_size')"
        />
      </div>
      <MetaLine v-else class="mb-2" data-test="movies-stats">
        <span
          ><strong>{{ data.stats.downloaded }}</strong>
          {{ t('media.films.stats.downloaded') }}</span
        >
        <span
          ><strong>{{ data.stats.waiting }}</strong> {{ t('media.films.stats.waiting') }}</span
        >
        <span>{{ formatGb(data.stats.totalGb) }}</span>
      </MetaLine>

      <QueuePanel :slug="slug" :manual-import-running="manualImports > 0" @imported="onImported" />

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
        data-test="movies-warning"
        @click:close="alerts.dismiss(text)"
        >{{ text }}</v-alert
      >
      <v-alert
        v-if="banner"
        :type="banner.type"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-test="movies-banner"
      >
        <div class="d-flex align-center ga-2">
          <v-progress-circular v-if="banner.type === 'info'" indeterminate size="16" width="2" />
          <span>{{ banner.text }}</span>
        </div>
      </v-alert>

      <!-- Barre d'outils -->
      <div class="movies-toolbar mb-2">
        <v-filter-field
          v-if="mdAndUp"
          :model-value="search"
          :prepend-inner-icon="msSearch"
          :placeholder="t('media.films.filters.search_placeholder')"
          :aria-label="t('media.films.filters.search_placeholder')"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="movies-toolbar__search"
          data-test="movies-search"
          @update:model-value="onSearch"
        />
        <FilterChips
          :model-value="query.status"
          :options="statusOptions"
          test-prefix="status"
          class="movies-toolbar__status"
          @update:model-value="setStatus"
        />
        <div class="movies-toolbar__actions">
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
              :aria-label="t('media.films.filters.open')"
              :title="t('media.films.filters.open')"
              data-test="movies-filters-open"
              @click="filtersOpen = true"
            />
          </v-badge>
          <ViewModeMenu
            v-model="viewMode"
            :options="viewOptions"
            :label="t('common.view_mode')"
            test-id="movies-view"
          />
          <v-btn
            v-if="mdAndUp"
            v-write
            :prepend-icon="selectMode ? msClose : msCheckBox"
            size="small"
            :variant="selectMode ? 'flat' : 'outlined'"
            :color="selectMode ? 'service' : undefined"
            data-test="movies-select-mode"
            @click="toggleSelectMode"
            >{{
              selectMode ? t('media.films.actions.cancel') : t('media.films.actions.select_mode')
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
              selectMode ? t('media.films.actions.cancel') : t('media.films.actions.select_mode')
            "
            :aria-pressed="selectMode"
            data-test="movies-select-mode"
            @click="toggleSelectMode"
          />
        </div>
      </div>
      <MovieFilters v-if="mdAndUp" :query="query" :facets="facets" class="mb-2" @change="patch" />

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
            :title="t('media.films.actions.refresh_filtered_title')"
            data-test="refresh-filtered"
            @click="refreshFiltered"
            >{{ t('media.films.actions.refresh_filtered') }}</v-btn
          >
          <v-btn
            v-write
            :prepend-icon="msSearch"
            size="small"
            variant="tonal"
            color="warning"
            :loading="busy.searchFiltered"
            :title="t('media.films.actions.search_filtered_title')"
            data-test="search-filtered"
            @click="prepareSearchFiltered"
            >{{ t('media.films.actions.search_filtered') }}</v-btn
          >
        </template>
        <v-spacer />
        <v-btn size="small" variant="text" data-test="reset-filters" @click="resetFilters">{{
          t('media.films.pagination.reset_filters')
        }}</v-btn>
      </div>

      <LibraryPagination
        :page="data.page"
        :total-pages="data.totalPages"
        :total="data.total"
        :library-total="data.libraryTotal"
        :per-page="data.perPage"
        i18n-prefix="media.films.pagination"
        @update:page="goToPage"
      />

      <!-- Liste -->
      <PullToRefresh :loading="pulling" :disabled="selectMode" @refresh="pullRefresh">
        <div
          class="movies-content"
          :class="{ 'movies-content--loading': library.isPlaceholderData.value }"
          data-test="movies-content"
        >
          <div
            v-if="viewMode === 'grid' || viewMode === 'wall'"
            :class="viewMode === 'wall' ? 'movies-wall' : 'movies-grid'"
          >
            <MovieCard
              v-for="movie in items"
              :key="movie.id"
              v-long-press="() => startSelection(movie.id)"
              :movie="movie"
              :select-mode="selectMode"
              :selected="selected.has(movie.id)"
              :compact="viewMode === 'wall'"
              :subtitle="subtitles.statusOf(movie.id)"
              :watched="movie.tmdbId !== null && watched.movies.has(movie.tmdbId)"
              @select="onSelect(movie.id, $event)"
              @open="openMovie(movie.id)"
              @monitor="toggleMonitor(movie.id)"
              @subtitles="Object.assign(subtitleSearch, { open: true, id: movie.id })"
            />
          </div>
          <v-card v-else-if="viewMode === 'extended'" variant="flat" class="movies-list">
            <MovieListItem
              v-for="movie in items"
              :key="movie.id"
              v-long-press="() => startSelection(movie.id)"
              :movie="movie"
              :select-mode="selectMode"
              :selected="selected.has(movie.id)"
              :watched="movie.tmdbId !== null && watched.movies.has(movie.tmdbId)"
              @select="onSelect(movie.id, $event)"
              @open="openMovie(movie.id)"
              @monitor="toggleMonitor(movie.id)"
            />
          </v-card>
          <MovieTable
            v-else-if="viewMode === 'table'"
            :movies="items"
            :select-mode="selectMode"
            :selected="selected"
            @select="onSelect"
            @open="openMovie"
          />
          <MovieShelves
            v-else
            :movies="items"
            :select-mode="selectMode"
            :selected="selected"
            @select="onSelect"
            @open="openMovie"
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
        i18n-prefix="media.films.pagination"
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
      :select-all-label="t('media.films.bulk.select_all')"
      @clear="toggleSelectMode"
      @select-all="selectAll"
    >
      <v-btn size="small" variant="tonal" data-test="bulk-edit" @click="openDialog('edit')">{{
        t('media.films.bulk.edit')
      }}</v-btn>
      <v-btn size="small" variant="tonal" data-test="bulk-tags" @click="openDialog('tags')">{{
        t('media.films.bulk.tags')
      }}</v-btn>
      <v-btn size="small" variant="tonal" data-test="bulk-rename" @click="openDialog('rename')">{{
        t('media.films.bulk.rename')
      }}</v-btn>
      <v-btn
        size="small"
        variant="tonal"
        color="error"
        data-test="bulk-delete"
        @click="openDialog('delete')"
        >{{ t('media.films.bulk.delete') }}</v-btn
      >
    </BulkActionBar>

    <SubtitleSearchDialog
      v-model="subtitleSearch.open"
      kind="movie"
      :item-id="subtitleSearch.id"
      @downloaded="subtitles.query.refetch()"
    />

    <!-- Panneau des filtres (mobile) -->
    <ResponsiveDialog v-model="filtersOpen" :title="t('media.films.filters.drawer_title')">
      <v-select
        v-model="draft.status"
        :items="statusItems"
        :label="t('media.films.table.status')"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-2"
      />
      <MovieFilters
        :query="draft"
        :facets="facets"
        stacked
        @change="(change) => Object.assign(draft, change)"
      />
      <template #actions>
        <v-btn variant="text" @click="resetFromSheet">{{
          t('media.films.pagination.reset_filters')
        }}</v-btn>
        <v-btn
          color="service"
          variant="flat"
          data-test="movies-filters-apply"
          @click="applyDraft"
          >{{ t('media.films.filters.apply') }}</v-btn
        >
      </template>
    </ResponsiveDialog>

    <BulkEditDialog
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
      @save="saveTags"
    />
    <BulkRenameDialog
      v-model="dialogs.rename"
      :items="selectedForRename"
      :preview="(id: number) => moviesApi.renamePreview(slug, id)"
      :run="(id: number) => moviesApi.rename(slug, id)"
      :keys="RENAME_KEYS"
      @done="onRenamed"
      @failed="showBanner('error', t('media.films.warnings_generic_error'))"
    />
    <BulkDeleteDialog
      v-model="dialogs.delete"
      :titles="selectedTitles"
      :loading="saving"
      @confirm="confirmDelete"
    />
    <AddMediaDialog
      v-model="addOpen"
      kind="movie"
      :slug="slug"
      :indexer-count="warnings.data.value?.indexerCount ?? 0"
      @added="refreshLibrary"
    />
    <ConfirmDialog
      v-model="searchConfirm.open"
      :message="t('media.films.warnings_search_confirm', { count: searchConfirm.ids.length })"
      :confirm-label="t('media.films.actions.search_filtered')"
      @confirm="searchFiltered"
    />
  </v-container>
</template>

<style scoped>
.movies-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.movies-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.movies-toolbar__search {
  flex: 1 1 220px;
  max-width: 320px;
}
.movies-toolbar__status {
  flex: 1 1 auto;
}
.movies-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
@media (max-width: 599px) {
  .movies-toolbar__search {
    max-width: none;
    flex-basis: 100%;
  }
  .movies-toolbar__status {
    flex: 1 1 0;
    min-width: 0;
  }
  .movies-toolbar__actions {
    flex-wrap: nowrap;
  }
}
.movies-content {
  transition: opacity 0.15s;
}
/* Maj+clic sélectionne une plage de films, pas le texte de la page. */
.movies-view--selecting .movies-content {
  user-select: none;
}
.movies-content--loading {
  opacity: 0.5;
}
.movies-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px 16px;
}
.movies-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}
@media (max-width: 599px) {
  .movies-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 12px 10px;
  }
}
.movies-list {
  margin: 0 -16px;
  background: transparent;
}
</style>
