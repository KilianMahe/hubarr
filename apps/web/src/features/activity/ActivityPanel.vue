<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Lectures en cours (`_now_playing`) : résumé (flux, Direct Play, Direct
// Stream, transcodages, bande passante), erreur du service, cartes ; en mode
// `compact` (tableau de bord, maquette P0, P5b.1 D3), une ligne de résumé et
// une ligne dense par lecture (vignette, titre, utilisateur · appareil,
// décision, débit, progression).
import type { Activity, ActivitySession } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import EmptyState from '../../components/EmptyState.vue';
import MediaListItem from '../../components/ds/MediaListItem.vue';
import MetaLine from '../../components/ds/MetaLine.vue';
import StatusChip from '../../components/ds/StatusChip.vue';
import SessionCard from './SessionCard.vue';

const props = defineProps<{
  activity: Activity | undefined;
  service: 'tautulli' | 'tracearr';
  emptyKey: string;
  compact?: boolean;
}>();
const emit = defineEmits<{ open: [session: ActivitySession] }>();
const { t } = useI18n();
const errorKey = (error: string) =>
  props.service === 'tautulli'
    ? `dashboard.plex.error.${error}`
    : `dashboard.plex.error_tracearr.${error}`;
const mbps = (kbps: number) => Math.round((kbps / 1000) * 10) / 10;
function decisionOf(session: ActivitySession): { key: string; color: string } | null {
  switch (session.transcodeDecision) {
    case 'transcode':
      return { key: 'dashboard.plex.decision.transcode', color: 'warning' };
    case 'copy':
      return { key: 'dashboard.plex.decision.direct_stream', color: 'info' };
    case 'direct play':
      return { key: 'dashboard.plex.decision.direct_play', color: 'success' };
    default:
      return null;
  }
}
const titleOf = (session: ActivitySession) =>
  session.grandparentTitle
    ? `${session.grandparentTitle}${session.episodeCode ? ` · ${session.episodeCode}` : ''}`
    : (session.title ?? t('dashboard.plex.unknown_title'));
</script>

<template>
  <div data-test="activity-panel">
    <v-progress-linear v-if="activity === undefined" indeterminate color="service" />
    <v-alert
      v-else-if="activity.error"
      type="warning"
      variant="tonal"
      density="compact"
      data-test="activity-error"
      >{{ t(errorKey(activity.error)) }}</v-alert
    >
    <template v-else-if="compact">
      <MetaLine class="mb-2" data-test="activity-summary">
        <span
          ><strong>{{ activity.streamCount }}</strong> {{ t('dashboard.plex.streams') }}</span
        >
        <span v-if="activity.directPlayCount > 0">{{
          t('dashboard.plex.summary.direct_play', { count: activity.directPlayCount })
        }}</span>
        <span v-if="activity.directStreamCount > 0">{{
          t('dashboard.plex.summary.direct_stream', { count: activity.directStreamCount })
        }}</span>
        <span v-if="activity.transcodeCount > 0">{{
          t('dashboard.plex.summary.transcode', { count: activity.transcodeCount })
        }}</span>
        <span v-if="activity.bandwidth"
          >{{ mbps(activity.bandwidth.totalKbps) }} {{ t('dashboard.plex.mbps') }}</span
        >
      </MetaLine>
      <p v-if="activity.sessions.length === 0" class="text-body-medium text-muted">
        {{ t(emptyKey) }}
      </p>
      <div v-else class="activity-rows">
        <MediaListItem
          v-for="(session, i) in activity.sessions"
          :key="session.sessionKey ?? i"
          :title="titleOf(session)"
          :image="session.poster"
          data-test="activity-row"
          @open="emit('open', session)"
        >
          <template #meta>
            <span v-if="session.userDisplayName">{{ session.userDisplayName }}</span>
            <span v-if="session.player ?? session.device">{{
              session.player ?? session.device
            }}</span>
          </template>
          <template #chips>
            <StatusChip
              v-if="decisionOf(session)"
              :label="t(decisionOf(session)?.key ?? '')"
              :color="decisionOf(session)?.color"
            />
            <span v-if="session.bandwidthKbps > 0" class="text-caption text-muted"
              >{{ mbps(session.bandwidthKbps) }} {{ t('dashboard.plex.mbps') }}</span
            >
          </template>
          <v-progress-linear
            :model-value="session.progressPercent"
            color="service"
            height="3"
            rounded
            class="mt-1"
          />
        </MediaListItem>
      </div>
    </template>
    <template v-else>
      <div class="d-flex flex-wrap ga-2 mb-3 text-body-small">
        <v-chip size="small" label
          >{{ activity.streamCount }} {{ t('dashboard.plex.streams') }}</v-chip
        >
        <v-chip size="small" label color="success">{{
          t('dashboard.plex.summary.direct_play', { count: activity.directPlayCount })
        }}</v-chip>
        <v-chip size="small" label color="info">{{
          t('dashboard.plex.summary.direct_stream', { count: activity.directStreamCount })
        }}</v-chip>
        <v-chip size="small" label color="warning">{{
          t('dashboard.plex.summary.transcode', { count: activity.transcodeCount })
        }}</v-chip>
        <v-chip v-if="activity.bandwidth" size="small" label
          >{{ t('dashboard.plex.bandwidth.total') }} {{ mbps(activity.bandwidth.totalKbps) }}
          {{ t('dashboard.plex.mbps') }} ({{ t('dashboard.plex.bandwidth.lan') }}
          {{ mbps(activity.bandwidth.lanKbps) }} · {{ t('dashboard.plex.bandwidth.wan') }}
          {{ mbps(activity.bandwidth.wanKbps) }})</v-chip
        >
        <v-chip v-else-if="activity.totalBitrate" size="small" label>{{
          activity.totalBitrate
        }}</v-chip>
      </div>
      <EmptyState v-if="activity.sessions.length === 0" :title="t(emptyKey)" />
      <v-row v-else density="compact">
        <v-col
          v-for="(session, i) in activity.sessions"
          :key="session.sessionKey ?? i"
          cols="12"
          md="6"
          xl="4"
        >
          <SessionCard :session="session" @open="emit('open', session)" />
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<style scoped>
.activity-rows {
  margin: 0 -16px;
}
</style>
