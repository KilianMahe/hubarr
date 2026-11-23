<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Watchlist (`decouverte/watchlist.html.twig`, routes n° 564 à 568) : filtre
// par type, recherche, tri (ajout, titre, note, année), note personnelle,
// retrait après confirmation ; un clic ouvre la fiche (`?detail=…`).
import type { WatchlistItem } from '@hubarr/shared';
import {
  mdiDelete,
  mdiMovieOpen,
  mdiNoteEditOutline,
  mdiStar,
  mdiTelevisionClassic,
} from '@mdi/js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { useNotifyStore } from '../../app/stores/notify';
import { discoverApi, discoverKeys } from './discover-api';
import TmdbDetailDialog from './TmdbDetailDialog.vue';
import { useRouteDetail } from './useRouteDetail';

const { t } = useI18n();
const notify = useNotifyStore();
const client = useQueryClient();
const detail = useRouteDetail();

const list = useQuery({
  queryKey: discoverKeys.watchlist,
  queryFn: ({ signal }) => discoverApi.watchlist(signal),
  retry: false,
});
const typeFilter = ref<'all' | 'movie' | 'tv'>('all');
const term = ref<string | null>('');
const SORTS = [
  'added_desc',
  'added_asc',
  'title_asc',
  'title_desc',
  'vote_desc',
  'year_desc',
] as const;
const sort = ref<(typeof SORTS)[number]>('added_desc');
const sortItems = computed(() =>
  SORTS.map((value) => ({ value, title: t(`decouverte.watchlist.sort.${value}`) })),
);

/** Filtre et tri de la watchlist (logique de la page d'origine). */
const items = computed(() => {
  const needle = (term.value ?? '').trim().toLowerCase();
  const rows = (list.data.value?.items ?? []).filter(
    (w) =>
      (typeFilter.value === 'all' || w.type === typeFilter.value) &&
      (needle === '' || w.title.toLowerCase().includes(needle)),
  );
  const by: Record<(typeof SORTS)[number], (a: WatchlistItem, b: WatchlistItem) => number> = {
    added_desc: (a, b) => b.addedAt.localeCompare(a.addedAt),
    added_asc: (a, b) => a.addedAt.localeCompare(b.addedAt),
    title_asc: (a, b) => a.title.localeCompare(b.title),
    title_desc: (a, b) => b.title.localeCompare(a.title),
    vote_desc: (a, b) => (b.vote ?? 0) - (a.vote ?? 0),
    year_desc: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  };
  return [...rows].sort(by[sort.value]);
});

const refresh = () => {
  void client.invalidateQueries({ queryKey: discoverKeys.watchlist });
  void client.invalidateQueries({ queryKey: discoverKeys.watchlistStatus });
  void client.invalidateQueries({ queryKey: ['dashboard', 'page'] });
};

// Note personnelle.
const editing = ref<WatchlistItem | null>(null);
const notes = ref('');
const notesOpen = computed({
  get: () => editing.value !== null,
  set: (value) => {
    if (!value) editing.value = null;
  },
});
function editNotes(item: WatchlistItem): void {
  editing.value = item;
  notes.value = item.notes ?? '';
}
const saveNotes = useMutation({
  mutationFn: () =>
    discoverApi.watchlistNotes(
      editing.value?.id ?? 0,
      notes.value.trim() === '' ? null : notes.value,
    ),
  onSuccess: () => {
    notify.success('decouverte.watchlist.notes_saved_toast');
    editing.value = null;
    refresh();
  },
  onError: () => {
    notify.error('decouverte.modal.network_error');
  },
});

// Retrait.
const removing = ref<WatchlistItem | null>(null);
const confirmOpen = ref(false);
function askRemove(item: WatchlistItem): void {
  removing.value = item;
  confirmOpen.value = true;
}
const remove = useMutation({
  mutationFn: (id: number) => discoverApi.watchlistRemove(id),
  onSuccess: () => {
    notify.success('decouverte.watchlist.removed_toast');
    refresh();
  },
  onError: () => {
    notify.error('decouverte.modal.network_error');
  },
});
</script>

<template>
  <v-container fluid class="py-4" data-test="watchlist-view">
    <ServiceDownBanner service="tmdb" />
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn-toggle v-model="typeFilter" mandatory density="compact" variant="outlined" divided>
        <v-btn value="all">{{ t('decouverte.watchlist.filter_all') }}</v-btn>
        <v-btn value="movie">{{ t('decouverte.watchlist.filter_movies') }}</v-btn>
        <v-btn value="tv">{{ t('decouverte.watchlist.filter_tv') }}</v-btn>
      </v-btn-toggle>
      <v-filter-field
        v-model="term"
        :placeholder="t('decouverte.watchlist.search_placeholder')"
        density="compact"
        hide-details
        variant="outlined"
        clearable
        style="max-width: 280px"
      />
      <v-filter-select
        v-model="sort"
        :items="sortItems"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 200px"
        :label="t('decouverte.filters.sort')"
      />
    </div>

    <v-progress-linear v-if="list.isFetching.value" indeterminate color="primary" class="mb-2" />
    <EmptyState
      v-if="list.data.value && list.data.value.items.length === 0"
      :icon="mdiStar"
      :title="t('decouverte.watchlist.empty_title')"
    >
      <v-btn :to="{ name: 'tmdb' }" color="primary" variant="tonal">{{
        t('sidebar.nav.discovery')
      }}</v-btn>
    </EmptyState>

    <div class="media-grid" data-test="watchlist-grid">
      <v-card
        v-for="item in items"
        :key="item.id"
        rounded="lg"
        :data-test="`watchlist-item-${item.tmdbId}`"
        @click="detail = { type: item.type, id: item.tmdbId }"
      >
        <v-img :src="item.poster ?? ''" :aspect-ratio="2 / 3" cover class="bg-surface-alt">
          <template #error>
            <div class="d-flex align-center justify-center fill-height">
              <v-icon :icon="item.type === 'tv' ? mdiTelevisionClassic : mdiMovieOpen" size="32" />
            </div>
          </template>
          <div class="d-flex pa-1 ga-1">
            <v-chip
              v-if="item.vote"
              size="x-small"
              variant="flat"
              color="surface"
              :prepend-icon="mdiStar"
              >{{ item.vote }}</v-chip
            >
            <v-spacer />
            <v-chip v-if="item.inLibrary" size="x-small" variant="flat" color="success">{{
              t('decouverte.card.in_library_short')
            }}</v-chip>
          </div>
        </v-img>
        <div class="pa-2">
          <div class="text-body-medium text-truncate" :title="item.title">{{ item.title }}</div>
          <div class="text-body-small text-muted">
            {{
              t(
                item.type === 'tv'
                  ? 'decouverte.watchlist.type_tv'
                  : 'decouverte.watchlist.type_film',
              )
            }}<template v-if="item.year"> · {{ item.year }}</template>
          </div>
          <div
            v-if="item.notes"
            class="text-body-small font-italic text-truncate"
            :title="item.notes"
          >
            {{ item.notes }}
          </div>
        </div>
        <v-card-actions class="pt-0">
          <v-btn
            :icon="mdiNoteEditOutline"
            size="small"
            variant="text"
            :aria-label="t('decouverte.watchlist.notes_title')"
            data-test="watchlist-notes"
            @click.stop="editNotes(item)"
          />
          <v-spacer />
          <v-btn
            :icon="mdiDelete"
            size="small"
            variant="text"
            color="error"
            :aria-label="t('common.action.delete')"
            data-test="watchlist-remove"
            @click.stop="askRemove(item)"
          />
        </v-card-actions>
      </v-card>
    </div>

    <ResponsiveDialog v-model="notesOpen" :title="t('decouverte.watchlist.notes_title')">
      <v-textarea
        v-model="notes"
        :placeholder="t('decouverte.watchlist.notes_placeholder')"
        auto-grow
        rows="3"
        data-test="notes-field"
      />
      <template #actions>
        <v-btn variant="text" @click="notesOpen = false">{{
          t('decouverte.watchlist.notes_cancel')
        }}</v-btn>
        <v-btn
          color="primary"
          :loading="saveNotes.isPending.value"
          data-test="notes-save"
          @click="saveNotes.mutate()"
          >{{ t('decouverte.watchlist.notes_save') }}</v-btn
        >
      </template>
    </ResponsiveDialog>
    <ConfirmDialog
      v-model="confirmOpen"
      :message="t('decouverte.watchlist.remove_confirm', { title: removing?.title ?? '' })"
      danger
      @confirm="removing && remove.mutate(removing.id)"
    />
    <TmdbDetailDialog v-model="detail" />
  </v-container>
</template>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
</style>
