// SPDX-License-Identifier: AGPL-3.0-or-later
// Activité factice d'un serveur média (une lecture en cours), partagée par les
// tests des pages d'activité et du tableau de bord.

import type { Activity } from '@hubarr/shared';

export const ACTIVITY: Activity = {
  enabled: true,
  configured: true,
  connected: true,
  error: null,
  streamCount: 1,
  directPlayCount: 1,
  directStreamCount: 0,
  transcodeCount: 0,
  bandwidth: { totalKbps: 8000, lanKbps: 8000, wanKbps: 0 },
  totalBitrate: null,
  sessions: [
    {
      sessionKey: '1',
      ratingKey: '42',
      quickLook: null,
      state: 'playing',
      title: 'Orbite Basse',
      grandparentTitle: null,
      episodeCode: null,
      year: '2019',
      mediaType: 'movie',
      poster: null,
      serverName: null,
      userDisplayName: 'alice',
      product: 'Plex Web',
      player: 'Chrome',
      device: null,
      platform: null,
      quality: '1080p',
      videoDecision: 'direct play',
      audioDecision: 'direct play',
      subtitleDecision: null,
      dynamicRange: null,
      videoCodec: 'h264',
      streamVideoCodec: 'h264',
      audioCodec: 'aac',
      streamAudioCodec: 'aac',
      transcodeDecision: 'direct play',
      location: 'lan',
      bandwidthKbps: 8000,
      progressPercent: 40,
    },
  ],
};
