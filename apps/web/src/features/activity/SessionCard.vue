<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'une lecture en cours (`_plex_session_card`, `_emby_session_card`),
// commune à Tautulli, Tracearr et Emby : affiche (proxy de Hubarr), titre,
// utilisateur et lecteur, état, progression, décision de lecture, qualité,
// codecs et bande passante.
import type { ActivitySession } from '@hubarr/shared';
import { msPauseFill, msPlayArrowFill } from '../../components/symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ session: ActivitySession }>();
const emit = defineEmits<{ open: [session: ActivitySession] }>();
const { t } = useI18n();

const decision = computed(() => {
  switch (props.session.transcodeDecision) {
    case 'transcode':
      return { key: 'dashboard.plex.decision.transcode', color: 'warning' };
    case 'copy':
      return { key: 'dashboard.plex.decision.direct_stream', color: 'info' };
    case 'direct play':
      return { key: 'dashboard.plex.decision.direct_play', color: 'success' };
    default:
      return null;
  }
});
const stateKey = computed(() =>
  props.session.state === 'paused'
    ? 'dashboard.plex.state.paused'
    : props.session.state === 'buffering'
      ? 'dashboard.plex.state.buffering'
      : 'dashboard.plex.state.playing',
);
const mbps = computed(() => Math.round((props.session.bandwidthKbps / 1000) * 10) / 10);
const codecs = (source: string | null, stream: string | null) =>
  source === null ? null : stream !== null && stream !== source ? `${source} → ${stream}` : source;
</script>

<template>
  <v-card
    variant="flat"
    border
    class="d-flex"
    data-test="session-card"
    @click="emit('open', session)"
  >
    <v-img
      v-if="session.poster"
      :src="session.poster"
      width="84"
      min-width="84"
      aspect-ratio="0.667"
      cover
      class="flex-grow-0"
    />
    <div class="pa-3 flex-grow-1" style="min-width: 0">
      <div class="text-body-medium font-weight-medium text-truncate" :title="session.title ?? ''">
        {{ session.title ?? t('dashboard.plex.unknown_title') }}
        <span v-if="session.year" class="text-muted">({{ session.year }})</span>
      </div>
      <div class="text-caption text-muted text-truncate">
        {{ session.userDisplayName ?? '—' }} · {{ session.player ?? session.product ?? '—' }}
        <span v-if="session.serverName"> · {{ session.serverName }}</span>
      </div>
      <div class="d-flex flex-wrap align-center ga-1 my-1">
        <v-chip
          size="x-small"
          label
          :prepend-icon="session.state === 'paused' ? msPauseFill : msPlayArrowFill"
          >{{ t(stateKey) }}</v-chip
        >
        <v-chip v-if="decision" size="x-small" label :color="decision.color">{{
          t(decision.key)
        }}</v-chip>
        <v-chip v-if="session.quality" size="x-small" label>{{ session.quality }}</v-chip>
        <v-chip v-if="session.dynamicRange" size="x-small" label>{{ session.dynamicRange }}</v-chip>
        <v-chip v-if="session.location" size="x-small" label>{{
          session.location.toUpperCase()
        }}</v-chip>
      </div>
      <div class="text-caption text-muted">
        <span v-if="codecs(session.videoCodec, session.streamVideoCodec)"
          >{{ t('dashboard.plex.track.video') }}
          {{ codecs(session.videoCodec, session.streamVideoCodec) }}</span
        >
        <span v-if="codecs(session.audioCodec, session.streamAudioCodec)">
          · {{ t('dashboard.plex.track.audio') }}
          {{ codecs(session.audioCodec, session.streamAudioCodec) }}</span
        >
        <span v-if="mbps > 0"> · {{ mbps }} {{ t('dashboard.plex.mbps') }}</span>
      </div>
      <v-progress-linear
        :model-value="session.progressPercent"
        color="service"
        height="4"
        rounded
        class="mt-2"
      />
    </div>
  </v-card>
</template>
