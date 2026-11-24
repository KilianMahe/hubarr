<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Lignes de l'historique Usenet (`usenet/_history_rows.html.twig`), communes à
// l'aperçu de la page de la file et à la page d'historique : icône d'état,
// nom et catégorie, taille et motif d'échec (traduit pour NZBGet), statut,
// âge de la fin.
import type { UsenetClientId, UsenetDownload } from '@hubarr/shared';
import { msCheck, msErrorFill, msSchedule } from '../../components/symbols';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { useTorrentI18n } from '../downloads/use-torrent-i18n';
import { nzbgetFailKey } from './usenet';

const props = defineProps<{ client: UsenetClientId; items: UsenetDownload[] }>();
const i18n = useI18n();
const { t } = i18n;
const format = useFormat();
const { age } = useTorrentI18n(() => 'qbittorrent');

function failText(item: UsenetDownload): string | null {
  const key = nzbgetFailKey(props.client, item.fail);
  return key !== null && i18n.te(key) ? t(key) : item.fail;
}
</script>

<template>
  <v-list density="compact" class="py-0 bg-transparent" data-test="usenet-history">
    <v-list-item v-for="item in items" :key="item.id" data-test="usenet-history-row">
      <template #prepend>
        <v-icon
          :icon="
            item.status === 'failed'
              ? msErrorFill
              : item.status === 'completed'
                ? msCheck
                : msSchedule
          "
          :color="
            item.status === 'failed' ? 'error' : item.status === 'completed' ? 'success' : undefined
          "
          size="18"
          class="me-2"
        />
      </template>
      <div class="d-flex align-center ga-2">
        <span class="text-body-medium text-truncate" :title="item.name">{{ item.name }}</span>
        <v-chip v-if="item.category" size="x-small" label>{{ item.category }}</v-chip>
      </div>
      <div class="text-caption text-muted">
        {{ format.bytes(item.size) }}
        <span v-if="failText(item)" class="text-error"> · {{ failText(item) }}</span>
      </div>
      <template #append>
        <div class="text-end">
          <v-chip size="x-small" variant="tonal">{{ t(`usenet.status.${item.status}`) }}</v-chip>
          <div class="text-caption text-muted">{{ age(item.completedAt) }}</div>
        </div>
      </template>
    </v-list-item>
  </v-list>
</template>
