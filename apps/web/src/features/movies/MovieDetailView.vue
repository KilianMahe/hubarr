<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Fiche d'un film (`#modal-film` de `films.html.twig`, P2.4), en **page** à
// défilement en cartes (`/medias/:slug/films/:id`, P5b.3) ;
// l'ancien lien profond `?open=<id>` de la bibliothèque y redirige (D88).
//
// En-tête sur l'image de fond (affiche, titre, statut, métadonnées, notes,
// genres, liens), rangée d'actions (suivi, recherche automatique et
// interactive, actualisation), puis cartes : retour d'action, synopsis
// repliable et sous-titres, fichier (informations techniques, extras,
// renommage, gestion des fichiers), détails (titres alternatifs, édition),
// historique résumé (historique complet et liste de blocage en feuille),
// distribution et équipe, suppression. Les sections longues (releases,
// édition, fichiers, historique) s'ouvrent en bottom sheet sur mobile et en
// dialogue sur desktop (`ResponsiveDialog`).
import type {
  ArrRelease,
  MovieCredit,
  MovieDetail,
  MovieEditRequest,
  MovieLibraryItem,
} from '@hubarr/shared';
import {
  mdiAlertCircleOutline,
  mdiBookmark,
  mdiBookmarkOutline,
  mdiChevronRight,
  mdiDeleteOutline,
  mdiFileDocumentOutline,
  mdiHistory,
  mdiInformationOutline,
  mdiLightningBolt,
  mdiMagnify,
  mdiPencil,
  mdiViewGridOutline,
  mdiRefresh,
  mdiStar,
} from '@mdi/js';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { ApiError } from '../../app/api/client';
import { useServiceFab } from '../../app/service-chrome';
import { useFormat } from '../../app/format';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import DetailCard from '../../components/ds/DetailCard.vue';
import DetailHeader from '../../components/ds/DetailHeader.vue';
import ReleaseList from '../../components/ReleaseList.vue';
import type { GrabState } from '../../components/release-sort';
import BulkDeleteDialog from '../../components/BulkDeleteDialog.vue';
import MovieSubtitles from '../bazarr/MovieSubtitles.vue';
import MovieCredits from './MovieCredits.vue';
import MovieEditPanel from './MovieEditPanel.vue';
import MovieFilesPanel from './MovieFilesPanel.vue';
import MovieHistoryTimeline from './MovieHistoryTimeline.vue';
import MovieRenameCard from './MovieRenameCard.vue';
import {
  bestRelease,
  castOf,
  crewOf,
  fallbackStep,
  searchOutcome,
  type SearchOutcome,
  formatRuntime,
  ratingsOf,
  statusBadges,
  techRows,
  type BadgeKind,
  type TechKey,
} from './movie-detail';
import { posterUrl } from './movie-display';
import { moviesApi, moviesKeys } from './movies-api';
import { useArrCommand } from './useArrCommand';

const route = useRoute();
const router = useRouter();
// Paramètres de la route (la page est réutilisée d'un film à l'autre).
const props = computed(() => ({
  slug: String(route.params.slug ?? ''),
  movieId: Number(route.params.id) || null,
}));

const { t } = useI18n();
const format = useFormat();
const queryClient = useQueryClient();
const commands = useArrCommand();

const open = computed(() => props.value.movieId !== null);
const id = computed(() => props.value.movieId ?? 0);

// Film de la bibliothèque déjà en cache : en-tête affiché avant la fiche complète.
const preview = computed(() =>
  queryClient
    .getQueriesData<{ items?: MovieLibraryItem[] }>({
      queryKey: [...moviesKeys.all(props.value.slug), 'library'],
    })
    .flatMap(([, data]) => data?.items ?? [])
    .find((item) => item.id === id.value),
);
// Indexeurs actifs (messages de la recherche), lus avec les alertes de la bibliothèque.
const warnings = useQuery({
  queryKey: computed(() => moviesKeys.warnings(props.value.slug)),
  queryFn: ({ signal }) => moviesApi.warnings(props.value.slug, signal),
  staleTime: 60_000,
  retry: false,
});
const indexerCount = computed(() => warnings.data.value?.indexerCount ?? 0);

/** Le film a changé : la bibliothèque sera relue au retour. */
function emitChanged(): void {
  void queryClient.invalidateQueries({
    queryKey: [...moviesKeys.all(props.value.slug), 'library'],
  });
}
/** Retour à la bibliothèque : arrière si on en vient, sinon navigation. */
function goBack(): void {
  const library = router.resolve({ name: 'radarr', params: { slug: props.value.slug } });
  const back = (router.options.history.state as { back?: unknown } | null)?.back;
  if (typeof back === 'string' && back.startsWith(library.path)) router.back();
  else void router.push(library);
}

// ── Données ─────────────────────────────────────────────────────────────────

const detail = useQuery({
  queryKey: computed(() => moviesKeys.movie(props.value.slug, id.value)),
  queryFn: ({ signal }) => moviesApi.detail(props.value.slug, id.value, signal),
  enabled: open,
  retry: false,
});
const movie = computed<MovieDetail | undefined>(() => detail.data.value);
const notFound = computed(
  () => detail.error.value instanceof ApiError && detail.error.value.status === 404,
);

const credits = useQuery({
  queryKey: computed(() => moviesKeys.movieSection(props.value.slug, id.value, 'credits')),
  queryFn: ({ signal }) => moviesApi.credits(props.value.slug, id.value, signal),
  enabled: open,
  staleTime: 300_000,
  retry: false,
});
// Personnes suivies (listes d'import TMDb Person) : marque-page des crédits.
const following = useQuery({
  queryKey: computed(() => moviesKeys.following(props.value.slug)),
  queryFn: ({ signal }) => moviesApi.following(props.value.slug, signal),
  enabled: open,
  staleTime: 60_000,
  retry: false,
});
function isFollowed(person: MovieCredit): boolean {
  return (
    person.personTmdbId !== null &&
    following.data.value?.[String(person.personTmdbId)] !== undefined
  );
}
function followLabel(person: MovieCredit): string {
  return `${t('media.films.detail.bookmark_artist')} — ${person.personName}`;
}
/** Bascule le suivi aussitôt à l'écran, comme l'original (sans attendre Radarr). */
async function toggleFollow(person: MovieCredit): Promise<void> {
  const personId = person.personTmdbId;
  if (personId === null) return;
  const key = moviesKeys.following(props.value.slug);
  const listId = following.data.value?.[String(personId)];
  const update = (next: number | undefined) =>
    queryClient.setQueryData<Record<string, number>>(key, (old) => {
      const rest = Object.entries(old ?? {}).filter(([id]) => id !== String(personId));
      return Object.fromEntries(next === undefined ? rest : [...rest, [String(personId), next]]);
    });
  try {
    if (listId !== undefined) {
      update(undefined);
      await moviesApi.unfollow(props.value.slug, listId);
    } else {
      update(0);
      const result = await moviesApi.follow(props.value.slug, {
        personTmdbId: personId,
        personName: person.personName,
        type: person.type,
        job: person.job ?? '',
      });
      update(result.listId ?? 0);
    }
  } catch {
    update(listId);
    showFeedback('error', t('media.films.detail.network_error'), false, 5_000);
  }
}

const extras = useQuery({
  queryKey: computed(() => moviesKeys.movieSection(props.value.slug, id.value, 'extras')),
  queryFn: ({ signal }) => moviesApi.extras(props.value.slug, id.value, signal),
  enabled: computed(() => open.value && movie.value?.hasFile === true),
  retry: false,
});

// Panneaux repliables : historique et liste de blocage chargés à l'ouverture.
const panels = ref<string[]>([]);
const history = useQuery({
  queryKey: computed(() => moviesKeys.movieSection(props.value.slug, id.value, 'history')),
  queryFn: ({ signal }) => moviesApi.history(props.value.slug, id.value, signal),
  enabled: open,
  retry: false,
});
const blocklist = useQuery({
  queryKey: computed(() => moviesKeys.movieSection(props.value.slug, id.value, 'blocklist')),
  queryFn: ({ signal }) => moviesApi.movieBlocklist(props.value.slug, id.value, signal),
  enabled: computed(() => open.value && panels.value.includes('blocklist')),
  retry: false,
});
const configWanted = computed(() => open.value && panels.value.includes('edit'));
const config = useQuery({
  queryKey: computed(() => moviesKeys.config(props.value.slug)),
  queryFn: ({ signal }) => moviesApi.config(props.value.slug, signal),
  enabled: configWanted,
  staleTime: 60_000,
});

// ── Affichage ───────────────────────────────────────────────────────────────

const title = computed(() => movie.value?.title ?? preview.value?.title ?? '');
const year = computed(() => movie.value?.year ?? preview.value?.year ?? null);
const fanart = computed(() => posterUrl(movie.value?.fanart ?? null, 'w1280'));
const poster = computed(() =>
  posterUrl(movie.value?.poster ?? preview.value?.poster ?? null, 'w342'),
);
const imdbUrl = computed(() =>
  movie.value?.imdbId
    ? `https://www.imdb.com/title/${encodeURIComponent(movie.value.imdbId)}/`
    : null,
);
const tmdbUrl = computed(() =>
  movie.value?.tmdbId ? `https://www.themoviedb.org/movie/${movie.value.tmdbId}` : null,
);
const ratings = computed(() => (movie.value ? ratingsOf(movie.value) : { imdb: null, tmdb: null }));
const badges = computed(() => (movie.value ? statusBadges(movie.value) : []));
const tech = computed(() => (movie.value ? techRows(movie.value) : []));
const cast = computed(() =>
  castOf(credits.data.value ?? []).map((person) => ({ person, role: person.character ?? '' })),
);
const crew = computed(() =>
  crewOf(credits.data.value ?? []).map((entry) => ({
    person: entry.person,
    role: entry.jobs.join(', '),
  })),
);

const BADGES: Record<BadgeKind, { color: string; label: string; tip: string }> = {
  monitored: {
    color: 'service-text',
    label: 'media.films.detail.follow',
    tip: 'media.films.status.radarr_monitors',
  },
  unmonitored: {
    color: 'muted',
    label: 'media.films.status.unmonitored',
    tip: 'media.films.status.radarr_not_monitored',
  },
  downloaded: {
    color: 'success',
    label: 'media.films.status.downloaded',
    tip: 'media.films.status.file_on_disk',
  },
  unavailable: { color: 'info', label: '', tip: '' },
  missing: {
    color: 'warning',
    label: 'media.films.status.missing',
    tip: 'media.films.status.released_not_found',
  },
};
function badgeLabel(kind: BadgeKind): string {
  if (kind !== 'unavailable') return t(BADGES[kind].label);
  const inCinemas = movie.value?.status === 'inCinemas';
  return (
    t('media.films.status.indisponible_prefix') +
    t(inCinemas ? 'media.films.status.in_cinemas' : 'media.films.status.announced')
  );
}
function badgeTip(kind: BadgeKind): string {
  if (kind !== 'unavailable') return t(BADGES[kind].tip);
  return t(
    movie.value?.status === 'inCinemas'
      ? 'media.films.status.in_cinemas_tip'
      : 'media.films.status.announced_tip',
  );
}

const TECH_LABELS: Record<TechKey, string> = {
  path: 'media.films.detail.path',
  quality: 'media.films.detail.quality',
  video: 'media.films.detail.video',
  hdr: 'media.films.detail.video',
  audio: 'media.films.detail.audio',
  languages: 'media.films.detail.languages',
  subtitles: 'media.films.detail.subtitles',
  size: 'media.films.table.size',
  group: 'media.films.detail.release_group',
  formats: 'media.films.detail.formats_col',
};
function techLabel(key: TechKey): string {
  return key === 'hdr' ? 'HDR' : t(TECH_LABELS[key]);
}

const extrasText = computed(() => {
  const list = extras.data.value;
  if (list === undefined) return extras.isError.value ? t('media.films.detail.no_extras') : null;
  if (list.length === 0) return t('media.films.detail.no_extras');
  return (
    String(list.length) +
    t('media.films.detail.extras_suffix') +
    list.map((extra) => extra.relativePath ?? extra.extension ?? '?').join(', ')
  );
});

// ── Retour d'action (`search-feedback` d'origine) ──────────────────────────

interface Feedback {
  type: 'info' | 'success' | 'warning' | 'error';
  text: string;
  spinner: boolean;
}
const feedback = ref<Feedback | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
/** Minuteries de la recherche directe, arrêtées au démontage. */
const timers = new Set<ReturnType<typeof setInterval>>();
function showFeedback(type: Feedback['type'], text: string, spinner = false, hideAfter = 0): void {
  clearTimeout(feedbackTimer);
  feedback.value = { type, text, spinner };
  if (hideAfter > 0) feedbackTimer = setTimeout(() => (feedback.value = null), hideAfter);
}
onBeforeUnmount(() => {
  clearTimeout(feedbackTimer);
  for (const timer of timers) clearInterval(timer);
});

const busy = reactive({
  search: false,
  refresh: false,
  monitor: false,
  delete: false,
  edit: false,
});

// Nouvelle fiche : panneaux refermés, retours effacés.
watch(
  () => props.value.movieId,
  () => {
    panels.value = [];
    feedback.value = null;
    clearTimeout(feedbackTimer);
    releasesPanel.open = false;
  },
);

/** Recharge la fiche et ce qui en dépend, et prévient la bibliothèque. */
async function reloadMovie(): Promise<void> {
  emitChanged();
  await queryClient.invalidateQueries({ queryKey: moviesKeys.movie(props.value.slug, id.value) });
}

// ── Suivi ───────────────────────────────────────────────────────────────────

async function toggleMonitor(): Promise<void> {
  const current = movie.value;
  if (current === undefined) return;
  busy.monitor = true;
  try {
    const { monitored } = await moviesApi.monitor(props.value.slug, current.id, !current.monitored);
    queryClient.setQueryData<MovieDetail>(moviesKeys.movie(props.value.slug, current.id), (old) =>
      old ? { ...old, monitored } : old,
    );
    emitChanged();
  } catch {
    showFeedback('error', t('media.films.detail.network_error'), false, 5_000);
  } finally {
    busy.monitor = false;
  }
}

// ── Recherche automatique ──────────────────────────────────────────────────

function indexersMessage(count: number): string {
  if (count <= 0) return t('media.films.detail.search_indexers_generic');
  return t(
    count > 1
      ? 'media.films.detail.search_indexers_plural'
      : 'media.films.detail.search_indexers_sing',
    { count },
  );
}
function queryingMessage(count: number): string {
  return t(
    count > 1
      ? 'media.films.detail.search_idx_query_plural'
      : 'media.films.detail.search_idx_query_sing',
    { count },
  );
}

/**
 * Après la commande : film dans la file ou grab récent ? Sinon, interrogation
 * directe des indexeurs et grab de la meilleure release acceptée (l'original
 * faisait de même pour compenser une recherche automatique sans résultat).
 */
async function checkSearchResult(movieId: number): Promise<void> {
  showFeedback('info', t('media.films.detail.search_results_check'), true);
  let outcome: SearchOutcome;
  try {
    const [items, queue] = await Promise.all([
      moviesApi.history(props.value.slug, movieId),
      moviesApi.queue(props.value.slug),
    ]);
    outcome = searchOutcome(movieId, items, queue);
  } catch {
    showFeedback('success', t('media.films.detail.search_completed'), false, 5_000);
    return;
  }
  if (outcome.kind === 'queue') {
    showFeedback(
      'success',
      t('media.films.detail.search_download_in_progress', {
        title: outcome.title,
        status: outcome.status,
      }),
    );
    return;
  }
  if (outcome.kind === 'grabbed') {
    showFeedback(
      'success',
      t('media.films.detail.search_torrent_grabbed', { indexer: outcome.indexer }),
    );
    return;
  }
  await searchIndexersDirectly(movieId);
}

async function searchIndexersDirectly(movieId: number): Promise<void> {
  showFeedback('info', t('media.films.detail.search_no_auto_result'), true);
  const steps = [
    t('media.films.detail.search_idx_connect'),
    queryingMessage(indexerCount.value),
    t('media.films.detail.search_torrents_searching'),
    t('media.films.detail.search_torrents_analysing'),
  ];
  let elapsed = 0;
  const countdown = setInterval(() => {
    elapsed += 1;
    const step = steps[fallbackStep(elapsed, steps.length)] ?? '';
    showFeedback(
      'info',
      step + t('media.films.detail.search_progress_elapsed', { seconds: elapsed }),
      true,
    );
  }, 1_000);
  timers.add(countdown);
  let releases: ArrRelease[];
  try {
    releases = await moviesApi.releases(props.value.slug, movieId);
  } catch {
    showFeedback('warning', t('media.films.detail.search_indexer_timeout'), false, 8_000);
    return;
  } finally {
    clearInterval(countdown);
    timers.delete(countdown);
  }
  const best = bestRelease(releases);
  const approved = releases.filter((release) => release.approved).length;
  if (best === null) {
    if (releases.length > 0) {
      showFeedback(
        'warning',
        t('media.films.detail.search_no_quality_match', { count: releases.length }),
        false,
        10_000,
      );
    } else {
      showFeedback('warning', t('media.films.detail.search_no_torrent_found'), false, 8_000);
    }
    return;
  }
  showFeedback(
    'info',
    t('media.films.detail.search_results_grab_best', { total: releases.length, approved }),
    true,
  );
  try {
    await moviesApi.grab(props.value.slug, movieId, best.guid, best.indexerId);
    showFeedback(
      'success',
      t('media.films.detail.search_grab_started', {
        indexer: best.indexer,
        title: best.title.substring(0, 50),
      }),
      false,
      10_000,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NETWORK') {
      showFeedback('warning', t('media.films.detail.search_grab_network_error'), false, 8_000);
    } else {
      showFeedback(
        'warning',
        t('media.films.detail.search_grab_failed_manual', {
          count: approved,
          error: errorMessage(error),
        }),
        false,
        10_000,
      );
    }
  }
}

/** Message d'erreur lisible (celui de Radarr quand il en donne un). */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || t('media.films.detail.unknown_error');
  return t('media.films.detail.unknown_error');
}

// ── Recherche interactive ──────────────────────────────────────────────────

interface ReleasesPanel {
  open: boolean;
  loading: boolean;
  error: boolean;
  items: ArrRelease[];
  /** État du grab par guid. */
  grabs: Record<string, GrabState>;
}
const releasesPanel = reactive<ReleasesPanel>({
  open: false,
  loading: false,
  error: false,
  items: [],
  grabs: {},
});
async function openReleases(): Promise<void> {
  const current = movie.value;
  if (current === undefined) return;
  feedback.value = null;
  Object.assign(releasesPanel, { open: true, loading: true, error: false, items: [], grabs: {} });
  try {
    releasesPanel.items = await moviesApi.releases(props.value.slug, current.id);
  } catch {
    releasesPanel.error = true;
  } finally {
    releasesPanel.loading = false;
  }
}
async function grabRelease(release: ArrRelease): Promise<void> {
  const current = movie.value;
  if (current === undefined || releasesPanel.grabs[release.guid] === 'pending') return;
  releasesPanel.grabs[release.guid] = 'pending';
  try {
    await moviesApi.grab(props.value.slug, current.id, release.guid, release.indexerId);
    releasesPanel.grabs[release.guid] = 'done';
    showFeedback('success', t('media.films.detail.grab_launched', { title: release.title }));
  } catch (error) {
    releasesPanel.grabs[release.guid] = 'failed';
    showFeedback('error', t('media.films.detail.grab_failed_err', { error: errorMessage(error) }));
  }
}

async function runSearch(): Promise<void> {
  const current = movie.value;
  if (current === undefined) return;
  busy.search = true;
  showFeedback('info', t('media.films.detail.search_start', { title: current.title }), true);
  try {
    const started = await moviesApi.search(props.value.slug, current.id);
    if (started.cmdId === null) {
      showFeedback('error', t('media.films.detail.search_cannot_launch'));
      return;
    }
    showFeedback('info', indexersMessage(indexerCount.value), true);
    const result = await commands.follow(props.value.slug, started.cmdId, ({ elapsed }) => {
      const suffix =
        elapsed >= 10 ? t('media.films.detail.search_progress_elapsed', { seconds: elapsed }) : '';
      showFeedback('info', queryingMessage(indexerCount.value) + suffix, true);
    });
    if (result.outcome === 'completed') await checkSearchResult(current.id);
    else if (result.outcome === 'failed') {
      const error = result.status.message ?? t('media.films.detail.unknown_error');
      showFeedback('error', t('media.films.detail.search_failed', { error }), false, 8_000);
    }
  } catch {
    showFeedback('error', t('media.films.detail.search_network_error'));
  } finally {
    busy.search = false;
  }
}

// ── Actualiser et scanner ──────────────────────────────────────────────────

async function runRefresh(): Promise<void> {
  const current = movie.value;
  if (current === undefined) return;
  busy.refresh = true;
  showFeedback('info', t('media.films.detail.refresh_in_progress'), true);
  try {
    const started = await moviesApi.refresh(props.value.slug, current.id);
    if (started.cmdId === null) {
      showFeedback('error', t('media.films.detail.refresh_launch_error'));
      return;
    }
    const result = await commands.follow(props.value.slug, started.cmdId, () => undefined);
    if (result.outcome === 'completed') {
      showFeedback('success', t('media.films.detail.refresh_done'), false, 4_000);
      await queryClient.invalidateQueries({
        queryKey: moviesKeys.movie(props.value.slug, current.id),
      });
      emitChanged();
    } else if (result.outcome === 'failed') {
      showFeedback('error', t('media.films.detail.refresh_failed'));
    }
  } catch {
    showFeedback('error', t('media.films.detail.network_error'));
  } finally {
    busy.refresh = false;
  }
}

// ── Suppression ────────────────────────────────────────────────────────────

type DeleteChoice = 'radarr' | 'file' | 'all';
const deleteChoice = ref<DeleteChoice | null>(null);
const deleteConfirmOpen = ref(false);
const deleteDialogOpen = ref(false);
function askDelete(choice: DeleteChoice): void {
  deleteChoice.value = choice;
  deleteConfirmOpen.value = true;
}
const deleteMessage = computed(() => {
  switch (deleteChoice.value) {
    case 'file':
      return t('media.films.detail.del_file_confirm', { title: title.value });
    case 'all':
      return t('media.films.detail.del_film_and_file_confirm', { title: title.value });
    default:
      return t('media.films.detail.edit_delete_confirm', { title: title.value });
  }
});

async function removeMovie(deleteFiles: boolean, addImportExclusion = false): Promise<void> {
  const current = movie.value;
  if (current === undefined) return;
  busy.delete = true;
  showFeedback('info', t('media.films.detail.delete_in_progress'), true);
  try {
    await moviesApi.remove(props.value.slug, current.id, { deleteFiles, addImportExclusion });
    showFeedback('success', t('media.films.detail.delete_success'));
    emitChanged();
    // Bannière de la bibliothèque (état de l'historique, comme l'original après la fermeture).
    await router.replace({
      name: 'radarr',
      params: { slug: props.value.slug },
      state: { removedMovie: current.title },
    });
  } catch {
    showFeedback('error', t('media.films.detail.delete_error_msg'));
  } finally {
    busy.delete = false;
  }
}

async function deleteFilesOnly(): Promise<void> {
  const current = movie.value;
  if (current === undefined) return;
  busy.delete = true;
  showFeedback('info', t('media.films.detail.delete_in_progress'), true);
  try {
    const files = await moviesApi.files(props.value.slug, current.id);
    if (files.length === 0) {
      showFeedback('error', t('media.films.detail.no_file_found'));
      return;
    }
    for (const file of files) await moviesApi.deleteFile(props.value.slug, file.id);
    showFeedback('success', t('media.films.detail.file_delete_success'), false, 5_000);
    await reloadMovie();
  } catch {
    showFeedback('error', t('media.films.detail.delete_error_msg'));
  } finally {
    busy.delete = false;
  }
}

function confirmDelete(): void {
  if (deleteChoice.value === 'file') void deleteFilesOnly();
  else void removeMovie(deleteChoice.value === 'all');
}

// ── Édition ────────────────────────────────────────────────────────────────

const editFeedback = ref<{ type: 'success' | 'error'; text: string } | null>(null);
async function saveEdit(
  changes: MovieEditRequest,
  success = t('media.films.detail.edit_saved'),
): Promise<void> {
  const current = movie.value;
  if (current === undefined) return;
  busy.edit = true;
  try {
    const result = await moviesApi.edit(props.value.slug, current.id, changes);
    queryClient.setQueryData(moviesKeys.movie(props.value.slug, current.id), result.movie);
    editFeedback.value = { type: 'success', text: success };
    setTimeout(() => (editFeedback.value = null), 3_000);
    emitChanged();
  } catch {
    editFeedback.value = {
      type: 'error',
      text: t('media.films.detail.edit_error', { error: t('media.films.detail.unknown_error') }),
    };
  } finally {
    busy.edit = false;
  }
}
function closePanel(name: string): void {
  panels.value = panels.value.filter((panel) => panel !== name);
}
/** Ouvre ou ferme la feuille d'une section. */
function setPanel(name: string, value: boolean): void {
  if (value) panels.value = [...panels.value.filter((panel) => panel !== name), name];
  else closePanel(name);
}
const overviewOpen = ref(false);

// Speed-dial (mobile, D130, P5b.4) : recherches, actualisation et édition,
// à la place du FAB d'ajout du service ; la rangée d'actions garde le suivi.
const { smAndDown } = useDisplay();
useServiceFab(() =>
  smAndDown.value && movie.value
    ? {
        icon: mdiLightningBolt,
        label: t('common.ds.actions'),
        testId: 'movie-speed-dial',
        actions: [
          {
            icon: mdiMagnify,
            label: t('media.films.detail.search'),
            testId: 'movie-search',
            onClick: () => void runSearch(),
          },
          {
            icon: mdiViewGridOutline,
            label: t('media.films.detail.interactive_search'),
            testId: 'movie-interactive',
            onClick: () => void openReleases(),
          },
          {
            icon: mdiRefresh,
            label: t('media.films.detail.refresh_scan'),
            testId: 'movie-refresh',
            onClick: () => void runRefresh(),
          },
          {
            icon: mdiPencil,
            label: t('media.films.detail.edit'),
            testId: 'movie-edit-fab',
            onClick: () => {
              setPanel('edit', true);
            },
          },
        ],
      }
    : null,
);

const renameCard = useTemplateRef<InstanceType<typeof MovieRenameCard>>('renameCard');

function onFilesChanged(): void {
  void reloadMovie();
}
</script>

<template>
  <div class="detail-page" data-test="movie-detail">
    <ServiceDownBanner service="radarr" :instance="props.slug" />
    <!-- En-tête : image de fond, affiche, titre, statut, métadonnées -->
    <DetailHeader
      :title="title"
      :fanart="fanart"
      :poster="poster"
      title-test="movie-title"
      back-test="movie-detail-close"
      @back="goBack"
    >
      <template #title
        >{{ title }}<template v-if="year"> ({{ year }})</template></template
      >
      <div
        v-if="movie?.originalTitle && movie.originalTitle !== movie.title"
        class="text-body-small detail-soft"
      >
        {{ t('media.films.detail.original_title_prefix') }}{{ movie.originalTitle }}
      </div>
      <div v-if="movie" class="d-flex flex-wrap ga-1 my-2" data-test="movie-badges">
        <v-chip
          v-for="badge in badges.filter((b) => b !== 'monitored' && b !== 'unmonitored')"
          :key="badge"
          size="small"
          variant="flat"
          :color="BADGES[badge].color"
          :title="badgeTip(badge)"
          >{{ badgeLabel(badge) }}</v-chip
        >
        <v-chip
          v-if="movie.quality"
          size="small"
          variant="flat"
          color="info"
          :title="t('media.films.status.file_quality_tip')"
          >{{ movie.quality }}</v-chip
        >
        <v-chip
          v-if="movie.sizeOnDisk > 0"
          size="small"
          variant="flat"
          color="surface"
          :title="t('media.films.status.file_size_tip')"
          >{{ format.bytes(movie.sizeOnDisk) }}</v-chip
        >
      </div>
      <div v-if="movie" class="d-flex flex-wrap align-center ga-3 text-body-medium detail-soft">
        <span v-if="movie.runtime">{{ formatRuntime(movie.runtime) }}</span>
        <v-chip v-if="movie.certification" size="x-small" label variant="outlined">{{
          movie.certification
        }}</v-chip>
        <span v-if="ratings.imdb" class="detail-rating" title="IMDb">
          <v-icon :icon="mdiStar" size="16" color="#f5c518" />{{ ratings.imdb }}
        </span>
        <span v-if="ratings.tmdb" class="detail-rating" title="TMDB">
          <v-icon :icon="mdiStar" size="16" color="#01d277" />{{ ratings.tmdb }}
        </span>
        <a v-if="imdbUrl" :href="imdbUrl" target="_blank" rel="noopener" class="detail-link"
          >IMDb</a
        >
        <a v-if="tmdbUrl" :href="tmdbUrl" target="_blank" rel="noopener" class="detail-link"
          >TMDB</a
        >
      </div>
      <div v-if="movie && movie.genres.length > 0" class="d-flex flex-wrap ga-1 mt-2">
        <v-chip v-for="genre in movie.genres" :key="genre" size="x-small" variant="tonal">{{
          genre
        }}</v-chip>
      </div>
    </DetailHeader>

    <div class="detail-page__body">
      <EmptyState
        v-if="notFound"
        :icon="mdiAlertCircleOutline"
        :title="t('media.api.movie_not_found')"
      />
      <EmptyState
        v-else-if="detail.isError.value && !movie"
        :icon="mdiAlertCircleOutline"
        :title="t('media.films.detail.loading_error_short')"
      >
        <v-btn variant="tonal" @click="detail.refetch()">{{ t('common.action.retry') }}</v-btn>
      </EmptyState>
      <div v-else-if="!movie" class="d-flex justify-center pa-8">
        <v-progress-circular indeterminate color="service" />
      </div>
      <template v-else>
        <!-- Rangée d'actions : suivi (état explicite, G2), recherches, actualisation -->
        <div class="detail-page__actions">
          <v-btn
            :prepend-icon="movie.monitored ? mdiBookmark : mdiBookmarkOutline"
            :variant="movie.monitored ? 'tonal' : 'outlined'"
            :color="movie.monitored ? 'service-text' : undefined"
            :aria-pressed="movie.monitored"
            :loading="busy.monitor"
            data-test="movie-monitor"
            @click="toggleMonitor"
            >{{
              t(movie.monitored ? 'media.films.detail.unfollow' : 'media.films.detail.follow')
            }}</v-btn
          >
          <!-- Mobile : recherches et actualisation dans le speed-dial -->
          <template v-if="!smAndDown">
            <v-btn
              :prepend-icon="mdiMagnify"
              color="service"
              variant="flat"
              :loading="busy.search"
              data-test="movie-search"
              @click="runSearch"
              >{{ t('media.films.detail.search') }}</v-btn
            >
            <v-btn
              :prepend-icon="mdiViewGridOutline"
              color="service-text"
              variant="tonal"
              :loading="releasesPanel.loading"
              data-test="movie-interactive"
              @click="openReleases"
              >{{ t('media.films.detail.interactive_search') }}</v-btn
            >
            <v-btn
              :prepend-icon="mdiRefresh"
              variant="text"
              :loading="busy.refresh"
              data-test="movie-refresh"
              @click="runRefresh"
              >{{ t('media.films.detail.refresh_scan') }}</v-btn
            >
          </template>
        </div>

        <v-alert
          v-if="feedback"
          :type="feedback.type"
          variant="tonal"
          density="compact"
          class="mb-3"
          data-test="movie-feedback"
        >
          <div class="d-flex align-center ga-2">
            <v-progress-circular v-if="feedback.spinner" indeterminate size="16" width="2" />
            <span>{{ feedback.text }}</span>
          </div>
        </v-alert>

        <div class="detail-page__cards">
          <!-- Synopsis repliable, sous-titres -->
          <DetailCard :title="t('media.films.detail.synopsis')">
            <p
              class="text-body-medium detail-overview"
              :class="{ 'detail-overview--clamped': !overviewOpen }"
            >
              {{ movie.overview || t('media.films.detail.no_synopsis') }}
            </p>
            <v-btn
              v-if="(movie.overview ?? '').length > 280"
              variant="text"
              size="small"
              class="px-0"
              @click="overviewOpen = !overviewOpen"
              >{{ t(overviewOpen ? 'common.action.close' : 'common.action.view_more') }}</v-btn
            >
            <MovieSubtitles :radarr-id="id" />
            <p v-if="movie.studio" class="text-body-small text-muted mb-0">
              {{ t('media.films.detail.studio_prefix') }}{{ movie.studio }}
            </p>
          </DetailCard>

          <!-- Fichier : informations techniques, extras, renommage, gestion -->
          <DetailCard
            :title="t('media.films.detail.file_info')"
            :icon="mdiFileDocumentOutline"
            data-test="movie-file-card"
          >
            <dl v-if="tech.length > 0" class="movie-page__tech" data-test="movie-techinfo">
              <template v-for="row in tech" :key="row.key">
                <dt class="text-muted">{{ techLabel(row.key) }}</dt>
                <dd>
                  <code v-if="row.key === 'path'" class="text-body-small">{{ row.text }}</code>
                  <template v-else-if="row.chips">
                    <v-chip
                      v-for="chip in row.chips"
                      :key="chip"
                      size="x-small"
                      variant="tonal"
                      class="mr-1"
                      >{{ chip }}</v-chip
                    >
                    <span v-if="row.score" class="text-body-small text-muted">{{ row.score }}</span>
                  </template>
                  <template v-else-if="row.bytes !== undefined">{{
                    format.bytes(row.bytes)
                  }}</template>
                  <template v-else>{{ row.text }}</template>
                </dd>
              </template>
            </dl>
            <p v-else class="text-body-medium text-muted">
              {{ t('media.films.detail.no_file_found') }}
            </p>
            <p v-if="movie.hasFile && extrasText" class="text-body-small text-muted">
              {{ extrasText }}
            </p>
            <MovieRenameCard
              v-if="movie.hasFile"
              ref="renameCard"
              :key="movie.id"
              :slug="props.slug"
              :movie="movie"
              @renamed="reloadMovie"
            />
            <v-btn
              variant="tonal"
              size="small"
              :append-icon="mdiChevronRight"
              data-test="panel-files"
              @click="setPanel('files', true)"
              >{{ t('media.films.detail.manage_files') }}</v-btn
            >
          </DetailCard>

          <!-- Détails : titres alternatifs, édition -->
          <DetailCard :title="t('decouverte.action.details')" :icon="mdiInformationOutline">
            <v-alert
              v-if="editFeedback"
              :type="editFeedback.type"
              variant="tonal"
              density="compact"
              class="mb-3"
              data-test="movie-edit-feedback"
              >{{ editFeedback.text }}</v-alert
            >
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                variant="tonal"
                size="small"
                :prepend-icon="mdiPencil"
                data-test="panel-edit"
                @click="setPanel('edit', true)"
                >{{ t('media.films.detail.edit_modify') }}</v-btn
              >
              <v-btn
                v-if="movie.alternateTitles.length > 0"
                variant="text"
                size="small"
                :append-icon="mdiChevronRight"
                @click="setPanel('titles', true)"
                >{{ t('media.films.detail.titles') }}</v-btn
              >
            </div>
          </DetailCard>

          <!-- Historique résumé : l'historique complet et la liste de blocage en feuille -->
          <DetailCard
            :title="t('media.films.detail.history')"
            :icon="mdiHistory"
            data-test="movie-history-card"
          >
            <v-progress-linear v-if="history.isPending.value" indeterminate color="service" />
            <p
              v-else-if="history.isError.value || (history.data.value ?? []).length === 0"
              class="text-body-medium text-muted"
            >
              {{ t('media.films.detail.no_history') }}
            </p>
            <MovieHistoryTimeline v-else :items="(history.data.value ?? []).slice(0, 3)" />
            <div class="d-flex flex-wrap ga-2 mt-2">
              <v-btn
                variant="text"
                size="small"
                :append-icon="mdiChevronRight"
                data-test="panel-history"
                @click="setPanel('history', true)"
                >{{ t('common.action.view_all') }}</v-btn
              >
              <v-btn
                variant="text"
                size="small"
                :append-icon="mdiChevronRight"
                data-test="panel-blocklist"
                @click="setPanel('blocklist', true)"
                >{{ t('media.films_blocklist.title') }}</v-btn
              >
            </div>
          </DetailCard>
        </div>

        <!-- Distribution et équipe -->
        <DetailCard :title="t('media.films.detail.cast')" class="mt-4">
          <v-progress-linear v-if="credits.isPending.value" indeterminate color="service" />
          <p v-else-if="cast.length === 0" class="text-body-medium text-muted mb-0">
            {{ t('media.films.detail.no_cast') }}
          </p>
          <MovieCredits v-else :people="cast">
            <template #action="{ person }">
              <button
                v-if="person.personTmdbId !== null"
                type="button"
                class="movie-page__follow"
                :class="{ 'movie-page__follow--on': isFollowed(person) }"
                :aria-pressed="isFollowed(person)"
                :title="t('media.films.detail.bookmark_artist')"
                :aria-label="followLabel(person)"
                data-test="person-follow"
                @click="toggleFollow(person)"
              >
                <v-icon :icon="isFollowed(person) ? mdiBookmark : mdiBookmarkOutline" size="16" />
              </button>
            </template>
          </MovieCredits>
          <template v-if="crew.length > 0">
            <h3 class="text-title-small mt-4 mb-2">{{ t('media.films.detail.crew') }}</h3>
            <MovieCredits :people="crew">
              <template #action="{ person }">
                <button
                  v-if="person.personTmdbId !== null"
                  type="button"
                  class="movie-page__follow"
                  :class="{ 'movie-page__follow--on': isFollowed(person) }"
                  :aria-pressed="isFollowed(person)"
                  :title="t('media.films.detail.bookmark_artist')"
                  :aria-label="followLabel(person)"
                  data-test="person-follow"
                  @click="toggleFollow(person)"
                >
                  <v-icon :icon="isFollowed(person) ? mdiBookmark : mdiBookmarkOutline" size="16" />
                </button>
              </template>
            </MovieCredits>
          </template>
        </DetailCard>

        <!-- Suppression : boutons lisibles en entier (G2) -->
        <DetailCard
          :title="t('common.action.delete')"
          :icon="mdiDeleteOutline"
          title-color="error"
          class="mt-4"
        >
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              color="warning"
              variant="tonal"
              size="small"
              :disabled="busy.delete"
              data-test="movie-delete-radarr"
              @click="askDelete('radarr')"
              >{{ t('media.films.detail.remove_from_radarr') }}</v-btn
            >
            <v-btn
              v-if="movie.hasFile"
              color="error"
              variant="tonal"
              size="small"
              :disabled="busy.delete"
              data-test="movie-delete-file"
              @click="askDelete('file')"
              >{{ t('media.films.detail.delete_file') }}</v-btn
            >
            <v-btn
              color="error"
              variant="tonal"
              size="small"
              :disabled="busy.delete"
              data-test="movie-delete-all"
              @click="askDelete('all')"
              >{{ t('media.films.detail.delete_all') }}</v-btn
            >
          </div>
        </DetailCard>
      </template>
    </div>

    <!-- Feuilles (bottom sheet sur mobile, dialogue sur desktop) -->
    <ResponsiveDialog
      v-model="releasesPanel.open"
      :title="t('media.films.detail.releases_available')"
      :max-width="1000"
    >
      <div data-test="movie-releases">
        <div v-if="releasesPanel.loading" class="pa-4 text-center text-body-medium text-muted">
          <v-progress-circular indeterminate size="18" width="2" class="mr-2" />
          {{ t('media.films.detail.interrogating_indexers') }}
        </div>
        <p v-else-if="releasesPanel.error" class="pa-4 text-body-medium text-error">
          {{ t('media.films.detail.loading_error') }}
        </p>
        <p
          v-else-if="releasesPanel.items.length === 0"
          class="pa-4 text-center text-body-medium text-muted"
        >
          {{ t('media.films.detail.no_release_found') }}
        </p>
        <ReleaseList
          v-else
          :releases="releasesPanel.items"
          :grabs="releasesPanel.grabs"
          @grab="grabRelease"
        />
      </div>
      <template #actions>
        <v-btn variant="text" @click="releasesPanel.open = false">{{
          t('media.films.detail.close')
        }}</v-btn>
      </template>
    </ResponsiveDialog>

    <ResponsiveDialog
      :model-value="panels.includes('edit')"
      :title="t('media.films.detail.edit_modify')"
      :max-width="720"
      @update:model-value="(v: boolean) => setPanel('edit', v)"
    >
      <MovieEditPanel
        v-if="movie"
        :slug="props.slug"
        :movie="movie"
        :config="config.data.value"
        :saving="busy.edit"
        @save="saveEdit"
        @update-path="(path) => saveEdit({ path }, t('media.films.banner.path_update'))"
        @delete="deleteDialogOpen = true"
        @cancel="closePanel('edit')"
      />
    </ResponsiveDialog>

    <ResponsiveDialog
      :model-value="panels.includes('files')"
      :title="t('media.films.detail.manage_files')"
      :max-width="1000"
      @update:model-value="(v: boolean) => setPanel('files', v)"
    >
      <MovieFilesPanel
        v-if="movie"
        :slug="props.slug"
        :movie="movie"
        @changed="onFilesChanged"
        @rename="renameCard?.rename()"
      />
    </ResponsiveDialog>

    <ResponsiveDialog
      :model-value="panels.includes('titles')"
      :title="t('media.films.detail.titles')"
      @update:model-value="(v: boolean) => setPanel('titles', v)"
    >
      <v-table v-if="movie" density="compact">
        <thead>
          <tr>
            <th>{{ t('media.films.detail.alt_title') }}</th>
            <th>{{ t('media.films.detail.source') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(alt, index) in movie.alternateTitles" :key="index">
            <td>{{ alt.title || '—' }}</td>
            <td>
              <v-chip size="x-small" variant="tonal">{{ alt.sourceType || '—' }}</v-chip>
            </td>
          </tr>
        </tbody>
      </v-table>
    </ResponsiveDialog>

    <ResponsiveDialog
      :model-value="panels.includes('history')"
      :title="t('media.films.detail.history')"
      :max-width="720"
      @update:model-value="(v: boolean) => setPanel('history', v)"
    >
      <MovieHistoryTimeline :items="(history.data.value ?? []).slice(0, 15)" />
    </ResponsiveDialog>

    <ResponsiveDialog
      :model-value="panels.includes('blocklist')"
      :title="t('media.films_blocklist.title')"
      :max-width="720"
      @update:model-value="(v: boolean) => setPanel('blocklist', v)"
    >
      <v-progress-linear v-if="blocklist.isPending.value" indeterminate color="service" />
      <p
        v-else-if="blocklist.isError.value || (blocklist.data.value ?? []).length === 0"
        class="text-body-medium text-muted"
      >
        {{ t('media.films_blocklist.empty') }}
      </p>
      <v-list v-else density="compact" class="py-0">
        <v-list-item
          v-for="item in blocklist.data.value ?? []"
          :key="item.id"
          :title="item.sourceTitle ?? '—'"
          :subtitle="
            [
              item.quality,
              item.indexer,
              item.message,
              item.date ? format.dateTime(item.date) : null,
            ]
              .filter(Boolean)
              .join(' · ')
          "
        />
      </v-list>
    </ResponsiveDialog>

    <ConfirmDialog
      v-model="deleteConfirmOpen"
      :message="deleteMessage"
      :confirm-label="t('common.action.delete')"
      danger
      @confirm="confirmDelete"
    />
    <BulkDeleteDialog
      v-model="deleteDialogOpen"
      :titles="movie ? [year ? `${movie.title} (${year})` : movie.title] : []"
      :loading="busy.delete"
      @confirm="(files, exclusion) => ((deleteDialogOpen = false), removeMovie(files, exclusion))"
    />
  </div>
</template>

<style scoped>
.movie-page__tech {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0 0 12px;
  font-size: 0.85rem;
}
.movie-page__tech dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.movie-page__follow {
  position: absolute;
  top: -4px;
  right: -4px;
  display: inline-flex;
  padding: 3px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.movie-page__follow--on {
  color: rgb(var(--v-theme-service-text));
}
</style>
