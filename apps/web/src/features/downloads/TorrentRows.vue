<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Lignes de la liste des torrents (`createRow`/`updateRow` de l'original) en
// trois vues : liste (nom, barre, ligne de statistiques séparées, puce d'état), tableau (colonnes
// triables) et compacte. Sélection par case, Maj+clic = plage ; clic sur la
// ligne = fiche ; badge de catégorie Radarr/Sonarr cliquable (résolution).
// Mobile (P5b.4, E3) : appui long = sélection ; pendant une sélection, un appui
// court ajoute ou retire la ligne au lieu d'ouvrir la fiche.
import {
  torrentPipelineOf,
  type Torrent,
  type TorrentClientId,
  type TorrentSort,
} from '@hubarr/shared';
import {
  msArrowDownward,
  msArrowUpward,
  msBalance,
  msDelete,
  msFolder,
  msGroup,
  msPauseFill,
  msPlayArrowFill,
  msSchedule,
} from '../../components/symbols';
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useFormat } from '../../app/format';
import { vLongPress } from '../../app/long-press';
import ProgressRow from '../../components/ds/ProgressRow.vue';
import StatusChip from '../../components/ds/StatusChip.vue';
import { stateColor, stateIcon, type TorrentView } from './torrents';
import { useTorrentI18n } from './use-torrent-i18n';

const props = defineProps<{
  client: TorrentClientId;
  torrents: Torrent[];
  view: TorrentView;
  selected: ReadonlySet<string>;
  sort: TorrentSort;
  desc: boolean;
  resolving: string | null;
}>();
const emit = defineEmits<{
  open: [hash: string];
  toggle: [hash: string, range: boolean];
  action: [hash: string, action: 'pause' | 'resume' | 'delete'];
  resolve: [torrent: Torrent];
  sort: [sort: TorrentSort];
}>();
const format = useFormat();
const { smAndDown } = useDisplay();
const { tk, tl, duration, age } = useTorrentI18n(() => props.client);

const stateLabel = (t: Torrent) => tk(`state.${t.state}`);
const ALL_COLUMNS: { key: TorrentSort | null; label: string; mobile?: true }[] = [
  { key: 'name', label: 'table.name', mobile: true },
  { key: 'size', label: 'table.size' },
  { key: 'progress', label: 'table.progress', mobile: true },
  { key: 'dlspeed', label: 'table.dl_speed' },
  { key: 'upspeed', label: 'table.up_speed' },
  { key: 'seeds', label: 'table.seeds' },
  { key: 'ratio', label: 'table.ratio' },
  { key: 'added', label: 'table.added' },
];
// Mobile (P5d.6, V31) : nom (taille et débits en dessous), progression et
// actions ; les autres colonnes sont dans la fiche du torrent.
const columns = computed(() =>
  smAndDown.value ? ALL_COLUMNS.filter((col) => col.mobile) : ALL_COLUMNS,
);

/** Badge de catégorie : Radarr (orange) ou Sonarr (bleu), cliquable pour ouvrir la fiche. */
function categoryColor(category: string): string | undefined {
  const pipeline = torrentPipelineOf(category);
  return pipeline === 'radarr' ? 'warning' : pipeline === 'sonarr' ? 'info' : undefined;
}
function categoryTitle(category: string): string | undefined {
  const pipeline = torrentPipelineOf(category);
  if (pipeline === 'radarr') return tk('row.title_radarr');
  if (pipeline === 'sonarr') return tk('row.title_sonarr');
  return undefined;
}

function onRowClick(event: Event, hash: string): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('[data-row-stop]')) return;
  if (smAndDown.value && props.selected.size > 0) emit('toggle', hash, false);
  else emit('open', hash);
}
</script>

<template>
  <div :data-view="view" data-test="torrent-rows">
    <v-table
      v-if="view === 'table'"
      density="compact"
      hover
      :class="{ 'torrent-table--mobile': smAndDown }"
    >
      <thead>
        <tr>
          <th style="width: 40px" />
          <th v-for="col in columns" :key="col.label">
            <button
              v-if="col.key"
              type="button"
              class="th-sort text-no-wrap"
              :class="{ 'text-service-text': sort === col.key }"
              @click="emit('sort', col.key)"
            >
              {{ tk(col.label) }}<span v-if="sort === col.key">{{ desc ? ' ↓' : ' ↑' }}</span>
            </button>
          </th>
          <th class="text-end">
            <span :class="{ 'd-sr-only': smAndDown }">{{ tk('table.actions') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="t in torrents"
          :key="t.hash"
          v-long-press="() => !selected.has(t.hash) && emit('toggle', t.hash, false)"
          class="cursor-pointer"
          :class="{ 'bg-surface-variant': selected.has(t.hash) }"
          data-test="torrent-row"
          :data-hash="t.hash"
          @click="onRowClick($event, t.hash)"
        >
          <td data-row-stop>
            <v-checkbox-btn
              :model-value="selected.has(t.hash)"
              :aria-label="t.name"
              density="compact"
              @click.stop="emit('toggle', t.hash, ($event as MouseEvent).shiftKey)"
            />
          </td>
          <td class="torrent-table__name" :title="t.name">
            <div class="d-flex align-center ga-2">
              <v-icon :icon="stateIcon(t.state)" :color="stateColor(t.state)" size="16" />
              <span class="text-truncate">{{ t.name }}</span>
              <v-chip
                v-if="t.category"
                size="x-small"
                label
                class="flex-shrink-0"
                :color="categoryColor(t.category)"
                :title="categoryTitle(t.category)"
                :loading="resolving === t.hash"
                data-row-stop
                data-test="torrent-category"
                @click.stop="torrentPipelineOf(t.category) !== null && emit('resolve', t)"
                >{{ resolving === t.hash ? tk('toast.cat_resolve_search') : t.category }}</v-chip
              >
            </div>
            <div
              v-if="smAndDown"
              class="text-body-small text-muted text-truncate"
              data-test="torrent-row-meta"
            >
              {{ format.bytes(t.size) }}
              <template v-if="t.dlSpeed > 0"> · ↓ {{ format.speed(t.dlSpeed) }}</template>
              <template v-if="t.upSpeed > 0"> · ↑ {{ format.speed(t.upSpeed) }}</template>
            </div>
          </td>
          <td v-if="!smAndDown" class="text-no-wrap">{{ format.bytes(t.size) }}</td>
          <td class="torrent-table__progress">
            <v-progress-linear
              :model-value="t.progress"
              :color="stateColor(t.state)"
              height="14"
              rounded
            >
              <span class="text-caption">{{ t.progress }}%</span>
            </v-progress-linear>
          </td>
          <template v-if="!smAndDown">
            <td class="text-no-wrap">{{ t.dlSpeed > 0 ? format.speed(t.dlSpeed) : '—' }}</td>
            <td class="text-no-wrap">{{ t.upSpeed > 0 ? format.speed(t.upSpeed) : '—' }}</td>
            <td>{{ t.seeds }}</td>
            <td>{{ t.ratio.toFixed(2) }}</td>
            <td class="text-no-wrap">
              {{ t.addedOn === null ? '—' : format.date(t.addedOn * 1000) }}
            </td>
          </template>
          <td class="text-end text-no-wrap" data-row-stop>
            <v-btn
              :icon="t.state === 'paused' ? msPlayArrowFill : msPauseFill"
              size="small"
              variant="text"
              :aria-label="tk(t.state === 'paused' ? 'row.resume_title' : 'row.pause_title')"
              data-test="torrent-toggle"
              @click="emit('action', t.hash, t.state === 'paused' ? 'resume' : 'pause')"
            />
            <v-btn
              :icon="msDelete"
              size="small"
              variant="text"
              color="error"
              :aria-label="tk('row.delete_title')"
              data-test="torrent-delete"
              @click="emit('action', t.hash, 'delete')"
            />
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-list v-else lines="three" density="compact" class="py-0 bg-transparent">
      <v-list-item
        v-for="t in torrents"
        :key="t.hash"
        v-long-press="() => !selected.has(t.hash) && emit('toggle', t.hash, false)"
        :active="selected.has(t.hash)"
        class="torrent-row px-2"
        :class="{ 'py-1': view === 'compact' }"
        data-test="torrent-row"
        :data-hash="t.hash"
        @click="onRowClick($event, t.hash)"
      >
        <template #prepend>
          <div class="d-flex align-center" data-row-stop>
            <v-checkbox-btn
              :model-value="selected.has(t.hash)"
              :aria-label="t.name"
              density="compact"
              @click.stop="emit('toggle', t.hash, ($event as MouseEvent).shiftKey)"
            />
          </div>
        </template>
        <div class="text-body-medium font-weight-medium text-truncate" :title="t.name">
          {{ t.name }}
        </div>
        <ProgressRow
          v-if="view === 'list'"
          :value="t.progress"
          :color="stateColor(t.state)"
          class="my-1"
        >
          <span>{{ format.bytes(t.size) }}</span>
          <span v-if="t.dlSpeed > 0" class="text-info"
            ><v-icon :icon="msArrowDownward" size="12" />{{ format.speed(t.dlSpeed) }}</span
          >
          <span v-if="t.upSpeed > 0" class="text-success"
            ><v-icon :icon="msArrowUpward" size="12" />{{ format.speed(t.upSpeed) }}</span
          >
          <span v-if="t.state === 'downloading' && t.eta !== null"
            ><v-icon :icon="msSchedule" size="12" />{{ duration(t.eta) }}</span
          >
          <span :title="tk('row.title_seeds_leechers')"
            ><v-icon :icon="msGroup" size="12" />{{ t.seeds }}/{{ t.leechs }}</span
          >
          <span :title="tk('row.title_ratio')"
            ><v-icon :icon="msBalance" size="12" />{{ t.ratio.toFixed(2) }}</span
          >
          <span
            v-if="t.addedOn !== null"
            class="d-none d-sm-inline-flex"
            :title="tl('row.title_added_tpl', { DATE: format.dateTime(t.addedOn * 1000) ?? '' })"
            >{{ age(t.addedOn) }}</span
          >
        </ProgressRow>
        <div class="d-flex align-center flex-wrap ga-1" :class="{ 'mt-1': view === 'compact' }">
          <StatusChip
            :label="stateLabel(t)"
            :color="stateColor(t.state)"
            data-test="torrent-state"
          />
          <v-chip
            v-if="t.category"
            size="x-small"
            label
            :prepend-icon="msFolder"
            :color="categoryColor(t.category)"
            :title="categoryTitle(t.category)"
            :loading="resolving === t.hash"
            data-row-stop
            data-test="torrent-category"
            @click.stop="torrentPipelineOf(t.category) !== null && emit('resolve', t)"
            >{{ resolving === t.hash ? tk('toast.cat_resolve_search') : t.category }}</v-chip
          >
          <template v-if="view === 'compact'">
            <v-spacer />
            <span class="text-caption text-no-wrap">{{ t.progress }}%</span>
          </template>
        </div>
        <template #append>
          <div class="d-flex" data-row-stop>
            <v-btn
              :icon="t.state === 'paused' ? msPlayArrowFill : msPauseFill"
              size="small"
              variant="text"
              :aria-label="tk(t.state === 'paused' ? 'row.resume_title' : 'row.pause_title')"
              data-test="torrent-toggle"
              @click.stop="emit('action', t.hash, t.state === 'paused' ? 'resume' : 'pause')"
            />
            <v-btn
              :icon="msDelete"
              size="small"
              variant="text"
              color="error"
              :aria-label="tk('row.delete_title')"
              data-test="torrent-delete"
              @click.stop="emit('action', t.hash, 'delete')"
            />
          </div>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<style scoped>
.th-sort {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.torrent-table__name {
  max-width: 460px;
}
.torrent-table__progress {
  min-width: 110px;
}
/* Mobile : le nom prend la place restante et se tronque (V31). */
.torrent-table--mobile .torrent-table__name {
  width: 100%;
  max-width: 0;
}
.torrent-table--mobile .torrent-table__progress {
  min-width: 72px;
  width: 72px;
}
.torrent-table--mobile :deep(td),
.torrent-table--mobile :deep(th) {
  padding-inline: 6px !important;
}
.torrent-row {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
