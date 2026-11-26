<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Centre de notifications de la barre du haut : cloche avec le nombre de
// notifications non lues, menu de l'historique (`useNotifyStore().history`),
// la plus récente en tête. Les entrées non lues sont marquées tant que le menu
// est ouvert, puis passent à « lues » à sa fermeture.
import {
  msCheckCircle,
  msClose,
  msDelete,
  msDoneAll,
  msError,
  msInfo,
  msNotifications,
} from './symbols';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { relativeTime, useFormat } from '../app/format';
import { useNotifyStore, type NotifyKind } from '../app/stores/notify';

const { t, locale } = useI18n();
const notify = useNotifyStore();
const format = useFormat();
const { xs } = useDisplay();
const open = ref(false);

// Heure courante, rafraîchie chaque minute menu ouvert (temps relatif).
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
watch(open, (value) => {
  clearInterval(timer);
  if (value) {
    now.value = Date.now();
    timer = setInterval(() => (now.value = Date.now()), 60_000);
  } else {
    notify.markAllRead();
  }
});
onBeforeUnmount(() => {
  clearInterval(timer);
});

const ICONS: Record<NotifyKind, string> = {
  success: msCheckCircle,
  error: msError,
  info: msInfo,
};
const COLORS: Record<NotifyKind, string> = { success: 'success', error: 'error', info: 'info' };
</script>

<template>
  <v-menu
    v-model="open"
    location="bottom end"
    :close-on-content-click="false"
    :max-width="xs ? 'calc(100vw - 16px)' : 380"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        icon
        :aria-label="t('topbar.notifications.label', { count: notify.unread })"
        data-test="notification-center"
      >
        <v-badge
          :model-value="notify.unread > 0"
          :content="notify.unread"
          max="99"
          color="error"
          data-test="notification-badge"
        >
          <v-icon :icon="msNotifications" />
        </v-badge>
      </v-btn>
    </template>
    <v-card :width="xs ? undefined : 380" data-test="notification-panel">
      <div class="d-flex align-center ps-4 pe-2 py-2">
        <span class="text-title-medium flex-grow-1">{{ t('topbar.notifications.title') }}</span>
        <v-btn
          :icon="msDoneAll"
          size="small"
          variant="text"
          :disabled="notify.unread === 0"
          :aria-label="t('topbar.notifications.mark_all_read')"
          :title="t('topbar.notifications.mark_all_read')"
          data-test="notification-mark-read"
          @click="notify.markAllRead()"
        />
        <v-btn
          :icon="msDelete"
          size="small"
          variant="text"
          :disabled="notify.history.length === 0"
          :aria-label="t('topbar.notifications.clear')"
          :title="t('topbar.notifications.clear')"
          data-test="notification-clear"
          @click="notify.clear()"
        />
      </div>
      <v-divider />
      <p
        v-if="notify.history.length === 0"
        class="text-body-medium text-muted text-center pa-6"
        data-test="notification-empty"
      >
        {{ t('topbar.notifications.empty') }}
      </p>
      <v-list v-else density="compact" class="notification-list py-0" aria-live="polite">
        <v-list-item
          v-for="entry in notify.history"
          :key="entry.id"
          :class="{ 'notification-unread': !entry.read }"
          :data-notification="entry.kind"
          :data-unread="!entry.read || undefined"
        >
          <template #prepend>
            <v-icon :icon="ICONS[entry.kind]" :color="COLORS[entry.kind]" class="me-n2" />
          </template>
          <v-list-item-title class="text-body-medium notification-text">{{
            t(entry.key, entry.values ?? {})
          }}</v-list-item-title>
          <v-list-item-subtitle class="text-body-small">
            <time
              :datetime="new Date(entry.at).toISOString()"
              :title="format.dateTime(entry.at) ?? undefined"
              >{{ relativeTime(entry.at, now, locale) }}</time
            >
          </v-list-item-subtitle>
          <template #append>
            <v-btn
              :icon="msClose"
              size="x-small"
              variant="text"
              :aria-label="t('topbar.notifications.remove')"
              data-test="notification-remove"
              @click="notify.remove(entry.id)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<style scoped>
.notification-list {
  max-height: min(420px, 60vh);
  overflow-y: auto;
}
.notification-text {
  white-space: normal;
  overflow-wrap: anywhere;
}
.notification-unread {
  background: rgba(var(--v-theme-primary), 0.08);
}
</style>
