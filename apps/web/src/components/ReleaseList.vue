<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Releases d'une recherche interactive (Radarr, Sonarr) : tableau triable sur
// desktop (release, indexeur, qualité, score, formats, taille, seeds, langues,
// âge), cartes sur mobile. L'ordre par défaut est celui du serveur (pertinence :
// acceptées, puis classement Radarr/Sonarr) ; un en-tête trie la colonne, un
// troisième clic revient à la pertinence. Une release refusée montre ses
// motifs ; le score détaille les formats personnalisés du profil.
import type { ArrRelease } from '@hubarr/shared';
import {
  msArrowDropDown,
  msArrowDropUp,
  msCheck,
  msClose,
  msDownload,
  msErrorFill,
} from './symbols';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useFormat } from '../app/format';
import { sortReleasesBy, type GrabState, type ReleaseSortKey } from './release-sort';

const props = defineProps<{
  releases: ArrRelease[];
  /** État du grab de chaque release (clé : guid). */
  grabs: Record<string, GrabState>;
  /** Étiquette par release (clé : guid), affichée près du titre : saison ou épisodes (Sonarr). */
  labels?: Record<string, string>;
}>();
const emit = defineEmits<{ grab: [release: ArrRelease] }>();
const { t } = useI18n();
const format = useFormat();
const { mdAndUp } = useDisplay();

/** Nombre de formats affichés en puces ; les suivants se résument en « +N ». */
const VISIBLE_FORMATS = 2;

const sortKey = ref<ReleaseSortKey | null>(null);
const ascending = ref(true);
/** Colonnes dont le premier clic trie en décroissant (le plus grand d'abord). */
const DESCENDING_FIRST: readonly ReleaseSortKey[] = ['score', 'size', 'seeders'];
function sortBy(key: ReleaseSortKey): void {
  const firstAscending = !DESCENDING_FIRST.includes(key);
  if (sortKey.value !== key) {
    sortKey.value = key;
    ascending.value = firstAscending;
  } else if (ascending.value === firstAscending) ascending.value = !firstAscending;
  else sortKey.value = null;
}
const sorted = computed(() =>
  sortKey.value === null
    ? props.releases
    : sortReleasesBy(props.releases, sortKey.value, ascending.value),
);

const COLUMNS: { key: ReleaseSortKey | null; label: string; end?: boolean }[] = [
  { key: 'title', label: 'media.films.detail.release_col' },
  { key: 'indexer', label: 'media.films.detail.indexer_col' },
  { key: 'quality', label: 'media.films.detail.quality_col' },
  { key: 'score', label: 'media.films.detail.score_col', end: true },
  { key: null, label: 'media.films.detail.formats_col' },
  { key: 'size', label: 'media.films.detail.size_col', end: true },
  { key: 'seeders', label: 'media.films.detail.seeds_col', end: true },
  { key: null, label: 'media.films.detail.langs_col' },
  { key: 'age', label: 'media.films.detail.age_col', end: true },
];

function detailTip(detail: { name: string; score: number }): string {
  return `${detail.name}: ${detail.score >= 0 ? '+' : ''}${detail.score}`;
}
function scoreTip(release: ArrRelease): string {
  return (
    release.scoreDetails.map(detailTip).join('\n') || t('media.films.detail.no_release_for_grab')
  );
}
function scoreClass(score: number): string {
  if (score > 0) return 'text-success font-weight-medium';
  return score < 0 ? 'text-error' : 'text-muted';
}
function hiddenFormatsTip(release: ArrRelease): string {
  return release.scoreDetails.slice(VISIBLE_FORMATS).map(detailTip).join('\n');
}
function seeds(release: ArrRelease): string {
  if (release.protocol !== 'torrent') return 'usenet';
  return release.seeders === null ? '—' : String(release.seeders);
}
const GRAB_ICONS: Record<GrabState | 'idle', string> = {
  idle: msDownload,
  pending: msDownload,
  done: msCheck,
  failed: msClose,
};
const GRAB_COLORS: Record<GrabState | 'idle', string> = {
  idle: 'service',
  pending: 'service',
  done: 'success',
  failed: 'error',
};
function grabLabel(release: ArrRelease): string {
  return `${t('common.action.download')} — ${release.title}`;
}
function grabState(release: ArrRelease): GrabState | 'idle' {
  return props.grabs[release.guid] ?? 'idle';
}
</script>

<template>
  <div class="release-list" data-test="release-list">
    <div
      v-if="mdAndUp"
      class="d-flex align-center ga-2 mb-1 text-body-small text-muted"
      data-test="release-toolbar"
    >
      <span>{{ t('media.films.detail.releases_count', { count: releases.length }) }}</span>
      <v-spacer />
      <span v-if="sortKey === null">{{ t('media.films.detail.sorted_by_relevance') }}</span>
      <v-btn
        v-else
        size="small"
        variant="text"
        data-test="release-sort-relevance"
        @click="sortKey = null"
        >{{ t('media.films.detail.sort_by_relevance') }}</v-btn
      >
    </div>
    <v-table v-if="mdAndUp" density="compact" fixed-header class="release-list__table">
      <thead>
        <tr>
          <th
            v-for="column in COLUMNS"
            :key="column.label"
            :class="{ 'text-end': column.end, 'release-list__sortable': column.key }"
            :aria-sort="
              column.key && sortKey === column.key
                ? ascending
                  ? 'ascending'
                  : 'descending'
                : undefined
            "
            @click="column.key && sortBy(column.key)"
          >
            {{ t(column.label) }}
            <v-icon
              v-if="column.key && sortKey === column.key"
              :icon="ascending ? msArrowDropUp : msArrowDropDown"
              size="16"
            />
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="release in sorted" :key="release.guid" data-test="release-row">
          <td class="release-list__title" :title="release.title">
            <v-icon
              v-if="!release.approved"
              :icon="msErrorFill"
              color="error"
              size="14"
              class="mr-1"
              :title="release.rejections.join('\n')"
            />
            <a
              v-if="release.infoUrl"
              :href="release.infoUrl"
              target="_blank"
              rel="noopener noreferrer"
              >{{ release.title }}</a
            >
            <template v-else>{{ release.title }}</template>
            <v-chip
              v-if="labels?.[release.guid]"
              size="x-small"
              label
              variant="outlined"
              class="ml-1"
              data-test="release-label"
              >{{ labels[release.guid] }}</v-chip
            >
          </td>
          <td class="text-no-wrap text-muted">{{ release.indexer }}</td>
          <td class="text-no-wrap">
            <v-chip size="x-small" variant="tonal" color="info">{{ release.quality }}</v-chip>
          </td>
          <td
            class="text-end"
            :class="scoreClass(release.customFormatScore)"
            :title="scoreTip(release)"
          >
            {{ release.customFormatScore }}
          </td>
          <td class="text-no-wrap">
            <v-chip
              v-for="detail in release.scoreDetails.slice(0, VISIBLE_FORMATS)"
              :key="detail.name"
              size="x-small"
              variant="tonal"
              class="mr-1"
              :title="detailTip(detail)"
              >{{ detail.name }}</v-chip
            >
            <v-chip
              v-if="release.scoreDetails.length > VISIBLE_FORMATS"
              size="x-small"
              variant="outlined"
              :title="hiddenFormatsTip(release)"
              data-test="release-more-formats"
              >+{{ release.scoreDetails.length - VISIBLE_FORMATS }}</v-chip
            >
            <span v-if="release.scoreDetails.length === 0" class="text-muted">—</span>
          </td>
          <td class="text-end text-no-wrap text-muted">
            {{ format.bytes(release.sizeMb * 1_048_576) }}
          </td>
          <td
            class="text-end"
            :class="release.protocol === 'torrent' ? 'text-success' : 'text-muted'"
          >
            {{ seeds(release) }}
          </td>
          <td class="text-no-wrap">{{ release.languages.join(', ') || '—' }}</td>
          <td class="text-end text-no-wrap text-muted">
            {{ t('profile.stats.days_short', { count: release.age }) }}
          </td>
          <td>
            <v-btn
              :icon="GRAB_ICONS[grabState(release)]"
              :color="
                release.approved || grabState(release) !== 'idle'
                  ? GRAB_COLORS[grabState(release)]
                  : undefined
              "
              :variant="release.approved ? 'flat' : 'tonal'"
              size="x-small"
              :loading="grabState(release) === 'pending'"
              :disabled="grabState(release) === 'done'"
              :aria-label="grabLabel(release)"
              data-test="release-grab"
              @click="emit('grab', release)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
    <v-list v-else density="compact" class="py-0">
      <v-list-item
        v-for="release in sorted"
        :key="release.guid"
        data-test="release-row"
        class="px-0"
      >
        <div class="d-flex align-start ga-2">
          <div class="flex-grow-1 release-list__mobile-body">
            <div class="text-body-small font-weight-medium release-list__wrap">
              <v-icon
                v-if="!release.approved"
                :icon="msErrorFill"
                color="error"
                size="14"
                :title="release.rejections.join('\n')"
              />
              {{ release.title }}
            </div>
            <div class="d-flex flex-wrap ga-1 align-center mt-1 text-body-small text-muted">
              <v-chip size="x-small" variant="tonal" color="info">{{ release.quality }}</v-chip>
              <v-chip
                v-if="labels?.[release.guid]"
                size="x-small"
                label
                variant="outlined"
                data-test="release-label"
                >{{ labels[release.guid] }}</v-chip
              >
              <span>{{ release.indexer }}</span>
              <span>· {{ format.bytes(release.sizeMb * 1_048_576) }}</span>
              <span>· {{ seeds(release) }}</span>
              <span>· {{ t('profile.stats.days_short', { count: release.age }) }}</span>
              <span :class="scoreClass(release.customFormatScore)"
                >· {{ release.customFormatScore }}</span
              >
            </div>
            <div
              v-if="!release.approved && release.rejections.length > 0"
              class="text-label-small text-error mt-1"
            >
              {{ release.rejections.join(' · ') }}
            </div>
          </div>
          <v-btn
            :icon="GRAB_ICONS[grabState(release)]"
            :color="GRAB_COLORS[grabState(release)]"
            :variant="release.approved ? 'flat' : 'tonal'"
            size="small"
            :loading="grabState(release) === 'pending'"
            :disabled="grabState(release) === 'done'"
            :aria-label="grabLabel(release)"
            data-test="release-grab"
            @click="emit('grab', release)"
          />
        </div>
      </v-list-item>
    </v-list>
  </div>
</template>

<style scoped>
.release-list__table {
  font-size: 0.8rem;
}
/* Hauteur suivant la fenêtre : titre, barre et actions du dialogue déduits. */
.release-list__table :deep(.v-table__wrapper) {
  max-height: max(320px, calc(100dvh - 300px));
}
.release-list__sortable {
  cursor: pointer;
  user-select: none;
}
.release-list__title {
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.release-list__title a {
  color: inherit;
}
.release-list__mobile-body {
  min-width: 0;
}
.release-list__wrap {
  overflow-wrap: anywhere;
}
</style>
