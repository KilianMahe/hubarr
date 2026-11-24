<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// En-tête d'un client torrent (`updateStats`, `refreshVpn` de l'original ;
// maquette P0 « qBittorrent », P5b.1 Q1) : vitesses ↓ / ↑ en grand avec
// l'état de la connexion, bouton « Limite » (vitesses alternatives), une ligne
// de résumé (espace libre, ratio, session), les totaux et pics sur grand écran,
// puis la ligne VPN (Gluetun) avec la synchronisation du port pour qBittorrent.
// Les compteurs par état sont portés par les filtres de la vue.
import {
  TORRENT_CAPABILITIES,
  type TorrentClientId,
  type TorrentStats,
  type TorrentVpn,
} from '@hubarr/shared';
import { msCircleFill, msShieldLock, msSpeed } from '../../components/symbols';
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useFormat } from '../../app/format';
import MetaLine from '../../components/ds/MetaLine.vue';
import SpeedIndicator from '../../components/ds/SpeedIndicator.vue';
import { useTorrentI18n } from './use-torrent-i18n';

const props = defineProps<{
  client: TorrentClientId;
  stats: TorrentStats | null;
  vpn: TorrentVpn | null;
  peaks: { dl: number; up: number };
  uptimeMs: number;
}>();
const emit = defineEmits<{ limits: [] }>();
const format = useFormat();
const { t, tk, tl, uptime } = useTorrentI18n(() => props.client);
const caps = computed(() => TORRENT_CAPABILITIES[props.client]);
const { smAndUp } = useDisplay();

const connectionColor = computed(() =>
  props.stats?.connection === 'connected'
    ? 'success'
    : props.stats?.connection === 'firewalled'
      ? 'warning'
      : 'error',
);
const portSync = computed(() => {
  const vpn = props.vpn;
  if (vpn?.portSync === true)
    return { color: 'success', label: tk('vpn.sync_ok'), title: tk('vpn.sync_title_match') };
  if (vpn?.portSync === false)
    return {
      color: 'error',
      label: tk('vpn.sync_ko'),
      title: tl('vpn.sync_title_desync_tpl', {
        VPN: vpn.forwardedPort ?? '—',
        QBT: vpn.clientPort ?? '—',
      }),
    };
  return { color: 'grey', label: tk('vpn.sync_unknown'), title: tk('vpn.sync_title_unknown') };
});
const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value);
const location = computed(() =>
  [props.vpn?.country, props.vpn?.city].filter((part) => part).join(' · '),
);
</script>

<template>
  <v-card variant="flat" border class="torrent-stats mb-3" data-test="torrent-stats">
    <div class="d-flex align-center ga-3">
      <v-icon :icon="msCircleFill" size="10" :color="connectionColor" aria-hidden="true" />
      <SpeedIndicator large :down="stats?.dlSpeed ?? 0" :up="stats?.upSpeed ?? 0" />
      <v-spacer />
      <v-btn
        v-if="smAndUp"
        :prepend-icon="msSpeed"
        :variant="stats?.altSpeed ? 'flat' : 'tonal'"
        :color="stats?.altSpeed ? 'service' : undefined"
        size="small"
        :aria-pressed="stats?.altSpeed === true"
        data-test="torrent-limits-open"
        @click="emit('limits')"
        >{{ t('usenet.toolbar.speed_limit') }}</v-btn
      >
      <v-btn
        v-else
        :icon="msSpeed"
        :variant="stats?.altSpeed ? 'flat' : 'tonal'"
        :color="stats?.altSpeed ? 'service' : undefined"
        size="small"
        :title="t('usenet.toolbar.speed_limit')"
        :aria-label="t('usenet.toolbar.speed_limit')"
        :aria-pressed="stats?.altSpeed === true"
        data-test="torrent-limits-open"
        @click="emit('limits')"
      />
    </div>
    <MetaLine class="mt-2" data-test="torrent-summary">
      <span
        >{{ tk('stats.free_space') }}
        <strong>{{ format.bytes(stats?.freeSpace ?? 0) }}</strong></span
      >
      <span
        >{{ tk('session.ratio') }} <strong>{{ (stats?.globalRatio ?? 0).toFixed(2) }}</strong></span
      >
      <span
        >{{ tk('session.label') }} ↓ {{ format.bytes(stats?.dlSession ?? 0) }} ↑
        {{ format.bytes(stats?.upSession ?? 0) }}</span
      >
      <span>{{ uptime(uptimeMs) }}</span>
    </MetaLine>
    <MetaLine class="d-none d-sm-flex mt-1">
      <span
        >{{ tk('stats.total_downloaded') }}
        <strong>{{ format.bytes(stats?.dlAllTime ?? 0) }}</strong></span
      >
      <span
        >{{ tk('stats.total_uploaded') }}
        <strong>{{ format.bytes(stats?.upAllTime ?? 0) }}</strong></span
      >
      <span>{{ tk('stats.peak_dl') }} {{ format.speed(peaks.dl) }}</span>
      <span>{{ tk('stats.peak_up') }} {{ format.speed(peaks.up) }}</span>
    </MetaLine>
    <MetaLine v-if="caps.vpn && vpn" class="mt-2" data-test="torrent-vpn">
      <span>
        <v-icon :icon="msShieldLock" size="16" :color="vpn.ok ? 'success' : 'error'" />
        <strong>{{ tk('vpn.label') }}</strong>
        {{ dash(vpn.organization) }}
      </span>
      <span>{{ dash(vpn.publicIp) }}</span>
      <span v-if="location">{{ location }}</span>
      <span
        >{{ tk('vpn.port_vpn') }} <strong>{{ dash(vpn.forwardedPort) }}</strong></span
      >
      <span
        >{{ tk('vpn.port_qbt') }} <strong>{{ dash(vpn.clientPort) }}</strong>
        <v-chip
          size="x-small"
          label
          :color="portSync.color"
          :title="portSync.title"
          data-test="vpn-sync"
          >{{ portSync.label }}</v-chip
        ></span
      >
    </MetaLine>
  </v-card>
</template>

<style scoped>
.torrent-stats {
  padding: 12px 16px;
}
</style>
