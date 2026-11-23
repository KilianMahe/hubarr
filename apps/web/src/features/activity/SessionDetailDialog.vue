<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Détail d'une lecture en cours (P5c.7, V19) : média, utilisateur et serveur,
// lecteur et appareil, réseau, qualité, décision de flux par piste (vidéo,
// audio, sous-titres) et codecs source → flux, plage dynamique, débit,
// progression. Dialogue sur desktop, bottom sheet sur mobile ; « Voir la
// fiche » ouvre l'aperçu TMDB quand il est connu.
import type { ActivitySession } from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { openQuickLook } from '../../app/overlays';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';

const props = defineProps<{ session: ActivitySession | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const open = computed({
  get: () => props.session !== null,
  set: (value: boolean) => {
    if (!value) emit('close');
  },
});

const DECISIONS: Record<string, string> = {
  transcode: 'dashboard.plex.decision.transcode',
  copy: 'dashboard.plex.decision.direct_stream',
  'direct play': 'dashboard.plex.decision.direct_play',
};
const decision = (value: string | null) => {
  if (value === null || value === '') return null;
  const key = DECISIONS[value.toLowerCase()];
  return key === undefined ? value : t(key);
};
const codec = (from: string | null, to: string | null) => {
  if (!from && !to) return null;
  if (!to || to === from) return from ?? to;
  if (!from) return to;
  return t('activity.detail.codec_change', { from, to });
};
const join = (...parts: (string | null)[]) => parts.filter((part) => part).join(' · ') || null;

const title = computed(() => {
  const session = props.session;
  if (session === null) return '';
  if (session.grandparentTitle)
    return `${session.grandparentTitle}${session.episodeCode ? ` · ${session.episodeCode}` : ''}`;
  return session.title ?? t('dashboard.plex.unknown_title');
});
const rows = computed(() => {
  const s = props.session;
  if (s === null) return [];
  const location =
    s.location === 'lan'
      ? t('dashboard.plex.bandwidth.lan')
      : s.location === 'wan'
        ? t('dashboard.plex.bandwidth.wan')
        : null;
  const all: [string, string | null][] = [
    ['user', s.userDisplayName],
    ['server', s.serverName],
    ['player', join(s.player, s.product)],
    ['device', join(s.device, s.platform)],
    ['location', location],
    ['quality', s.quality],
    ['stream', decision(s.transcodeDecision)],
    ['video', join(decision(s.videoDecision), codec(s.videoCodec, s.streamVideoCodec))],
    ['audio', join(decision(s.audioDecision), codec(s.audioCodec, s.streamAudioCodec))],
    ['subtitles', decision(s.subtitleDecision)],
    ['dynamic_range', s.dynamicRange],
    [
      'bandwidth',
      s.bandwidthKbps > 0
        ? `${Math.round((s.bandwidthKbps / 1000) * 10) / 10} ${t('dashboard.plex.mbps')}`
        : null,
    ],
  ];
  return all.filter((row): row is [string, string] => row[1] !== null && row[1] !== '');
});

function openMedia(): void {
  const look = props.session?.quickLook;
  if (look?.type && look.id) {
    openQuickLook({ kind: 'tmdb', type: look.type, id: look.id });
    open.value = false;
  }
}
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t('activity.detail.title')" :max-width="620">
    <div v-if="session" data-test="session-detail">
      <div class="d-flex ga-4 mb-4">
        <v-img
          v-if="session.poster"
          :src="session.poster"
          width="84"
          :aspect-ratio="2 / 3"
          cover
          class="flex-grow-0 rounded bg-surface-alt"
        />
        <div class="min-w-0">
          <div class="text-title-medium" data-test="session-detail-title">{{ title }}</div>
          <div v-if="session.grandparentTitle && session.title" class="text-body-medium">
            {{ session.title }}
          </div>
          <div v-if="session.year" class="text-body-small text-muted">{{ session.year }}</div>
          <v-chip
            v-if="session.state && ['playing', 'paused', 'buffering'].includes(session.state)"
            size="x-small"
            variant="tonal"
            class="mt-2"
            >{{ t(`dashboard.plex.state.${session.state}`) }}</v-chip
          >
        </div>
      </div>
      <div class="mb-4">
        <div class="d-flex text-body-small mb-1">
          <span>{{ t('activity.detail.progress') }}</span><v-spacer /><span
            >{{ Math.round(session.progressPercent) }} %</span
          >
        </div>
        <v-progress-linear
          :model-value="session.progressPercent"
          color="service"
          height="6"
          rounded
          :aria-label="t('activity.detail.progress')"
        />
      </div>
      <dl class="session-detail__grid">
        <template v-for="[key, value] in rows" :key="key">
          <dt class="text-body-small text-muted">{{ t(`activity.detail.${key}`) }}</dt>
          <dd class="text-body-medium" :data-test="`session-detail-${key}`">{{ value }}</dd>
        </template>
      </dl>
    </div>
    <template #actions>
      <v-btn
        v-if="session?.quickLook?.type && session.quickLook.id"
        variant="tonal"
        data-test="session-detail-open"
        @click="openMedia"
        >{{ t('activity.detail.open_media') }}</v-btn
      >
      <v-btn variant="text" @click="open = false">{{ t('common.action.close') }}</v-btn>
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.session-detail__grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 16px;
  margin: 0;
}
.session-detail__grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
