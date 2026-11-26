<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Fiche d'un torrent (`openDetail`/`renderDetail` de l'original) : onglets
// général, fichiers (priorité modifiable si le client le permet), trackers et
// pairs ; actions pause/reprise, vérification, réannonce, suppression.
// Hubarr ajoute, selon les capacités, les actions que l'original n'exposait
// que dans l'API : démarrage forcé, séquentiel, premières/dernières pièces,
// renommage, catégorie, déplacement et limites du torrent.
import { TORRENT_CAPABILITIES, type Torrent, type TorrentClientId } from '@hubarr/shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useFormat } from '../../app/format';
import { apiErrorText } from '../../app/api/error-text';
import { useNotifyStore } from '../../app/stores/notify';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { torrentKeys, torrentsApi } from './torrents-api';
import { TRACKER_STATUS_KEYS, bytesToMbps, mbpsToBytes } from './torrents';
import { useTorrentI18n } from './use-torrent-i18n';
import { pageReadOnly, vWrite } from '../../app/access';

const props = defineProps<{
  client: TorrentClientId;
  torrent: Torrent | null;
  categories: string[];
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ delete: [hash: string]; changed: [] }>();
const format = useFormat();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const { t, tk, say, duration } = useTorrentI18n(() => props.client);
const caps = computed(() => TORRENT_CAPABILITIES[props.client]);
const api = computed(() => torrentsApi(props.client));
const hash = computed(() => props.torrent?.hash ?? '');
const tab = ref('general');
const busy = ref<string | null>(null);

const detail = useQuery({
  queryKey: computed(() => torrentKeys.detail(props.client, hash.value)),
  queryFn: ({ signal }) => api.value.detail(hash.value, signal),
  enabled: computed(() => open.value && hash.value !== ''),
  retry: false,
});

const rename = ref('');
const location = ref('');
const category = ref<string | null>(null);
const dlLimit = ref('');
const upLimit = ref('');
// Sources séparées : l'actualisation de la liste remplace l'objet `torrent`,
// mais l'onglet et les champs ne se réinitialisent qu'à l'ouverture ou au
// changement de torrent (un getter renvoyant un tableau se déclencherait à
// chaque actualisation).
watch(
  [open, () => props.torrent?.hash],
  ([isOpen]) => {
    if (!isOpen || props.torrent === null) return;
    tab.value = 'general';
    rename.value = props.torrent.name;
    location.value = props.torrent.savePath;
    category.value = props.torrent.category;
    dlLimit.value = bytesToMbps(props.torrent.dlLimit);
    upLimit.value = bytesToMbps(props.torrent.upLimit);
  },
  { immediate: true },
);

const props_ = computed(() => {
  const p = detail.data.value?.properties;
  if (p === undefined) return [];
  return [
    ['props.downloaded', format.bytes(p.downloaded)],
    ['props.uploaded', format.bytes(p.uploaded)],
    ['props.ratio', p.ratio.toFixed(2)],
    ['props.dl_speed', format.speed(p.dlSpeed)],
    ['props.up_speed', format.speed(p.upSpeed)],
    ['props.eta', duration(p.eta)],
    ['props.seeds', `${p.seeds} / ${p.seedsTotal}`],
    ['props.peers', `${p.peers} / ${p.peersTotal}`],
    ['props.total_size', format.bytes(p.totalSize)],
    ['props.added', p.addedOn === null ? '—' : format.dateTime(p.addedOn * 1000)],
    ['props.completed', p.completedOn === null ? '—' : format.dateTime(p.completedOn * 1000)],
  ] as const;
});

const priorityItems = computed(() => {
  const labels: Record<number, string> = {
    0: 'modal_detail.files.prio_skip',
    1: 'modal_detail.files.prio_normal',
    6: 'modal_detail.files.prio_high',
    7: 'modal_detail.files.prio_max',
  };
  return (caps.value.filePriorities ?? []).map((value) => ({
    value,
    title: tk(labels[value] ?? 'modal_detail.files.prio_normal'),
  }));
});
const priorityLabel = (priority: number) =>
  props.client === 'transmission'
    ? tk(
        priority < 0
          ? 'modal_detail.files.prio_low'
          : priority > 0
            ? 'modal_detail.files.prio_high'
            : 'modal_detail.files.prio_normal',
      )
    : String(priority);

async function run(name: string, task: () => Promise<unknown>, successKey?: string): Promise<void> {
  busy.value = name;
  try {
    await task();
    if (successKey) notify.success(successKey);
    emit('changed');
    await queryClient.invalidateQueries({ queryKey: torrentKeys.detail(props.client, hash.value) });
  } catch (error) {
    say.error(apiErrorText(error, t, 'qbittorrent.toast.error_generic'));
  } finally {
    busy.value = null;
  }
}

const action = (verb: string, successKey: string, body: unknown = {}) =>
  run(verb, () => api.value.torrent(hash.value, verb, body), successKey);

const setPriority = (fileId: number, priority: number) =>
  run('priority', () =>
    api.value.torrent(hash.value, 'files/priority', { fileIds: [fileId], priority }),
  );
</script>

<template>
  <ResponsiveDialog
    v-model="open"
    :title="detail.data.value?.properties.name || torrent?.name || tk('modal_detail.loading')"
    :max-width="900"
  >
    <div data-test="torrent-detail">
      <v-tabs v-model="tab" density="compact" color="service-text" class="mb-3">
        <v-tab value="general" data-test="torrent-tab-general">{{
          tk('modal_detail.tab_general')
        }}</v-tab>
        <v-tab value="files" data-test="torrent-tab-files">{{
          tk('modal_detail.tab_files')
        }}</v-tab>
        <v-tab value="trackers" data-test="torrent-tab-trackers">{{
          tk('modal_detail.tab_trackers')
        }}</v-tab>
        <v-tab value="peers" data-test="torrent-tab-peers">{{
          tk('modal_detail.tab_peers')
        }}</v-tab>
      </v-tabs>
      <v-progress-linear v-if="detail.isPending.value" indeterminate color="service" />
      <v-alert v-else-if="detail.isError.value" type="error" variant="tonal" density="compact">{{
        tk('modal_detail.error_load')
      }}</v-alert>
      <v-window v-else-if="detail.data.value" v-model="tab">
        <v-window-item value="general">
          <v-row density="compact">
            <v-col v-for="[label, value] in props_" :key="label" cols="6" md="4">
              <div class="text-caption text-muted">{{ tk(`modal_detail.${label}`) }}</div>
              <div class="text-body-medium">{{ value }}</div>
            </v-col>
            <v-col v-if="detail.data.value.properties.savePath" cols="12">
              <div class="text-caption text-muted">{{ tk('modal_detail.props.save_path') }}</div>
              <code class="text-body-small">{{ detail.data.value.properties.savePath }}</code>
            </v-col>
          </v-row>

          <v-expansion-panels v-write variant="accordion" class="mt-3">
            <v-expansion-panel :title="tk('modal_detail.actions.more')" data-test="torrent-more">
              <v-expansion-panel-text>
                <div v-if="caps.advanced && torrent" class="d-flex flex-wrap ga-2 mb-3">
                  <v-btn
                    size="small"
                    variant="tonal"
                    :color="torrent.forceStart ? 'service-text' : undefined"
                    :loading="busy === 'force-start'"
                    @click="
                      action('force-start', 'qbittorrent.toast.action_sent', {
                        value: !torrent.forceStart,
                      })
                    "
                    >{{ tk('modal_detail.actions.force_start') }}</v-btn
                  >
                  <v-btn
                    size="small"
                    variant="tonal"
                    :color="torrent.sequential ? 'service-text' : undefined"
                    :loading="busy === 'sequential'"
                    @click="action('sequential', 'qbittorrent.toast.action_sent')"
                    >{{ tk('modal_detail.actions.sequential') }}</v-btn
                  >
                  <v-btn
                    size="small"
                    variant="tonal"
                    :color="torrent.firstLast ? 'service-text' : undefined"
                    :loading="busy === 'first-last'"
                    @click="action('first-last', 'qbittorrent.toast.action_sent')"
                    >{{ tk('modal_detail.actions.first_last') }}</v-btn
                  >
                </div>
                <div v-if="caps.advanced" class="d-flex ga-2 align-center mb-2">
                  <v-text-field
                    v-model="rename"
                    :label="tk('modal_detail.actions.rename')"
                    density="compact"
                    hide-details
                  />
                  <v-btn
                    variant="tonal"
                    :loading="busy === 'rename'"
                    data-test="torrent-rename"
                    @click="action('rename', 'qbittorrent.toast.action_sent', { name: rename })"
                    >{{ t('common.action.save') }}</v-btn
                  >
                </div>
                <div v-if="caps.setCategory" class="d-flex ga-2 align-center mb-2">
                  <v-combobox
                    v-model="category"
                    :items="categories"
                    :label="tk('modal_add.category_label')"
                    density="compact"
                    hide-details
                  />
                  <v-btn
                    variant="tonal"
                    :loading="busy === 'category'"
                    @click="
                      action('category', 'qbittorrent.toast.action_sent', {
                        category: category ?? '',
                      })
                    "
                    >{{ t('common.action.save') }}</v-btn
                  >
                </div>
                <div v-if="caps.location" class="d-flex ga-2 align-center mb-2">
                  <v-text-field
                    v-model="location"
                    :label="tk('modal_detail.actions.location')"
                    density="compact"
                    hide-details
                  />
                  <v-btn
                    variant="tonal"
                    :loading="busy === 'location'"
                    data-test="torrent-location"
                    @click="action('location', 'qbittorrent.toast.action_sent', { location })"
                    >{{ t('common.action.save') }}</v-btn
                  >
                </div>
                <div class="d-flex ga-2 align-center flex-wrap">
                  <v-text-field
                    v-model="dlLimit"
                    :label="`↓ ${t('usenet.toolbar.speed_limit_placeholder')}`"
                    density="compact"
                    hide-details
                    inputmode="decimal"
                    style="min-width: 160px"
                  />
                  <v-text-field
                    v-model="upLimit"
                    :label="`↑ ${t('usenet.toolbar.speed_limit_placeholder')}`"
                    density="compact"
                    hide-details
                    inputmode="decimal"
                    style="min-width: 160px"
                  />
                  <v-btn
                    variant="tonal"
                    :loading="busy === 'limit'"
                    @click="
                      action('limit', 'usenet.toast.speed_set', {
                        dl: mbpsToBytes(dlLimit),
                        up: mbpsToBytes(upLimit),
                      })
                    "
                    >{{ t('common.action.apply') }}</v-btn
                  >
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-window-item>

        <v-window-item value="files">
          <p v-if="detail.data.value.files.length === 0" class="text-center text-muted py-4">
            {{ tk('modal_detail.files.empty') }}
          </p>
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>{{ tk('modal_detail.files.col_name') }}</th>
                <th>{{ tk('modal_detail.files.col_size') }}</th>
                <th>{{ tk('modal_detail.files.col_progress') }}</th>
                <th>{{ tk('modal_detail.files.col_priority') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="file in detail.data.value.files"
                :key="file.index"
                data-test="torrent-file"
              >
                <td class="text-truncate" style="max-width: 320px" :title="file.name">
                  {{ file.name.split('/').pop() }}
                </td>
                <td class="text-no-wrap">{{ format.bytes(file.size) }}</td>
                <td class="text-no-wrap">{{ Math.round(file.progress * 100) }}%</td>
                <td style="min-width: 130px">
                  <v-select
                    v-if="caps.filePriorities && !pageReadOnly"
                    :model-value="file.priority"
                    :items="priorityItems"
                    density="compact"
                    hide-details
                    variant="plain"
                    @update:model-value="(value: number) => setPriority(file.index, value)"
                  />
                  <span v-else>{{ priorityLabel(file.priority) }}</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>

        <v-window-item value="trackers">
          <p v-if="detail.data.value.trackers.length === 0" class="text-center text-muted py-4">
            {{ tk('modal_detail.trackers.empty') }}
          </p>
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>{{ tk('modal_detail.trackers.col_url') }}</th>
                <th>{{ tk('modal_detail.trackers.col_status') }}</th>
                <th>{{ tk('modal_detail.trackers.col_seeds') }}</th>
                <th>{{ tk('modal_detail.trackers.col_leechs') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(tracker, index) in detail.data.value.trackers" :key="index">
                <td
                  class="text-truncate"
                  style="max-width: 320px"
                  :title="tracker.message || tracker.url"
                >
                  {{ tracker.url }}
                </td>
                <td>
                  {{
                    TRACKER_STATUS_KEYS[tracker.status]
                      ? tk(TRACKER_STATUS_KEYS[tracker.status] ?? '')
                      : tracker.status || '—'
                  }}
                </td>
                <td>{{ tracker.seeds ?? '—' }}</td>
                <td>{{ tracker.leechs ?? '—' }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>

        <v-window-item value="peers">
          <p v-if="detail.data.value.peers.length === 0" class="text-center text-muted py-4">
            {{ tk('modal_detail.peers.empty') }}
          </p>
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>{{ tk('modal_detail.peers.col_ip') }}</th>
                <th>{{ tk('modal_detail.peers.col_client') }}</th>
                <th>{{ tk('modal_detail.peers.col_progress') }}</th>
                <th>{{ tk('modal_detail.peers.col_dl') }}</th>
                <th>{{ tk('modal_detail.peers.col_up') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(peer, index) in detail.data.value.peers" :key="index">
                <td class="text-no-wrap">
                  {{ peer.ip }}{{ peer.port === null ? '' : `:${peer.port}` }}
                  <span v-if="peer.countryCode" class="text-muted">({{ peer.countryCode }})</span>
                </td>
                <td class="text-truncate" style="max-width: 180px">{{ peer.client || '—' }}</td>
                <td>{{ peer.progress }}%</td>
                <td class="text-no-wrap">{{ format.speed(peer.dlSpeed) }}</td>
                <td class="text-no-wrap">{{ format.speed(peer.upSpeed) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>
      </v-window>
    </div>
    <template #actions>
      <v-btn
        v-if="torrent"
        v-write
        variant="tonal"
        :color="torrent.state === 'paused' ? 'success' : 'warning'"
        :loading="busy === 'pause' || busy === 'resume'"
        data-test="detail-toggle"
        @click="
          torrent.state === 'paused'
            ? action('resume', 'qbittorrent.toast.resumed')
            : action('pause', 'qbittorrent.toast.paused')
        "
        >{{
          tk(
            torrent.state === 'paused'
              ? 'modal_detail.actions.resume'
              : 'modal_detail.actions.pause',
          )
        }}</v-btn
      >
      <v-btn
        v-write
        variant="tonal"
        :loading="busy === 'recheck'"
        @click="action('recheck', 'qbittorrent.toast.recheck_started')"
        >{{ tk('modal_detail.actions.recheck') }}</v-btn
      >
      <v-btn
        v-write
        variant="tonal"
        :loading="busy === 'reannounce'"
        @click="action('reannounce', 'qbittorrent.toast.reannounce_sent')"
        >{{ tk('modal_detail.actions.reannounce') }}</v-btn
      >
      <v-spacer />
      <v-btn v-write color="error" variant="tonal" @click="emit('delete', hash)">{{
        tk('modal_detail.actions.delete')
      }}</v-btn>
    </template>
  </ResponsiveDialog>
</template>
