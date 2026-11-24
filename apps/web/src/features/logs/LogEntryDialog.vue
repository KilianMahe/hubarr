<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Détail d'une entrée de journal : niveau, date, service, message complet et
// contexte (instance, méthode, chemin, statut, durée, erreur…), avec copie de
// l'entrée en JSON pour un rapport de bug.
import type { LogEntry } from '@hubarr/shared';
import { msContentCopy } from '../../components/symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import { useNotifyStore } from '../../app/stores/notify';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { entryText, levelColor, logServiceLabel } from './logs-api';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ entry: LogEntry | null }>();
const { t } = useI18n();
const format = useFormat();
const notify = useNotifyStore();

const context = computed(() =>
  props.entry === null || Object.keys(props.entry.context).length === 0
    ? null
    : JSON.stringify(props.entry.context, null, 2),
);

async function copy(): Promise<void> {
  if (props.entry === null) return;
  try {
    await navigator.clipboard.writeText(entryText(props.entry));
    notify.success('common.labels.copied');
  } catch {
    notify.error('error.generic.message');
  }
}
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t('admin.logs.detail.title')" :max-width="760">
    <div v-if="entry" class="d-flex flex-column ga-3" data-test="log-detail">
      <div class="d-flex flex-wrap align-center ga-2">
        <v-chip :color="levelColor(entry.level)" size="small" variant="tonal" label>{{
          t(`admin.logs.level.${entry.level}`)
        }}</v-chip>
        <span class="text-body-medium">{{ format.dateTime(entry.time, true) }}</span>
        <span v-if="entry.service" class="text-body-medium text-muted"
          >· {{ logServiceLabel(entry.service) }}</span
        >
      </div>
      <pre class="log-pre log-pre--msg" data-test="log-detail-msg">{{ entry.msg || '—' }}</pre>
      <template v-if="context">
        <div class="text-label-large">{{ t('admin.logs.detail.context') }}</div>
        <pre class="log-pre" data-test="log-detail-context">{{ context }}</pre>
      </template>
    </div>
    <template #actions>
      <v-btn :prepend-icon="msContentCopy" variant="tonal" data-test="log-copy" @click="copy">{{
        t('common.labels.copy')
      }}</v-btn>
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.log-pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 8px;
  padding: 12px;
  margin: 0;
  max-height: 50vh;
  overflow: auto;
}
.log-pre--msg {
  font-size: 0.875rem;
}
</style>
