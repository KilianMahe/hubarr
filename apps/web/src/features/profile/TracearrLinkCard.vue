<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte « Tracearr » du profil (lot 7) : choix de son compte Tracearr, qui
// alimente les badges « Vu » des fiches et de la bibliothèque ; état de la
// synchronisation ; « Resynchroniser » (réimport complet) pour l'admin. Le
// premier import tourne en arrière-plan : la carte se relit jusqu'à sa fin.
import type { TracearrLink } from '@hubarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotifyStore } from '../../app/stores/notify';
import { useSessionStore } from '../../app/stores/session';
import { msSync } from '../../components/symbols';
import { TRACEARR_LINK_KEY, WATCHED_KEY, watchedApi } from '../activity/watched';

/** Relecture de l'état tant que le premier import n'est pas terminé. */
const PENDING_POLL_MS = 3_000;

const { t, locale } = useI18n();
const session = useSessionStore();
const notify = useNotifyStore();
const queryClient = useQueryClient();

const link = useQuery({
  queryKey: TRACEARR_LINK_KEY,
  queryFn: ({ signal }) => watchedApi.link(signal),
  refetchInterval: (query) => {
    const data = query.state.data;
    return data?.linked && data.sync?.lastRunAt === null ? PENDING_POLL_MS : false;
  },
});
const pending = computed(
  () => link.data.value?.linked != null && link.data.value.sync?.lastRunAt == null,
);

// Fin d'un import : les badges « Vu » sont relus.
watch(
  () => link.data.value?.sync?.lastRunAt,
  (now, before) => {
    if (now !== before) void queryClient.invalidateQueries({ queryKey: WATCHED_KEY });
  },
);

function received(next: TracearrLink): void {
  queryClient.setQueryData(TRACEARR_LINK_KEY, next);
  void queryClient.invalidateQueries({ queryKey: WATCHED_KEY });
}

const setLink = useMutation({
  mutationFn: (key: string | null) => watchedApi.setLink({ key }),
  onSuccess: (next) => {
    received(next);
    notify.success(next.linked ? 'profile.tracearr.linked' : 'profile.tracearr.unlinked');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});
const resync = useMutation({
  mutationFn: () => watchedApi.resync(),
  onSuccess: (next) => {
    received(next);
    notify.success('profile.tracearr.resynced');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});

const items = computed(() => {
  const data = link.data.value;
  if (data === undefined) return [];
  const accounts = data.accounts.map((account) => ({ title: account.name, value: account.key }));
  // Compte associé que Tracearr ne connaît plus : reste affiché pour être retiré.
  if (data.linked !== null && !accounts.some((item) => item.value === data.linked?.key)) {
    accounts.unshift({
      title: data.linked.name ?? t('profile.tracearr.unknown_account'),
      value: data.linked.key,
    });
  }
  return accounts;
});
const selected = computed(() => link.data.value?.linked?.key ?? null);

const syncText = computed(() => {
  const sync = link.data.value?.sync;
  if (!sync) return null;
  if (sync.lastRunAt === null) return t('profile.tracearr.sync_pending');
  const date = new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(sync.lastRunAt));
  return t('profile.tracearr.sync_status', { date, count: sync.plays });
});
</script>

<template>
  <v-card rounded="xl" class="pa-2" data-test="profile-tracearr">
    <v-card-title class="text-title-medium">{{ t('profile.tracearr.section') }}</v-card-title>
    <v-card-text>
      <p class="text-body-small text-muted mb-4">{{ t('profile.tracearr.hint') }}</p>
      <v-progress-linear v-if="link.isPending.value" indeterminate color="service" />
      <template v-else-if="link.data.value">
        <v-alert
          v-if="link.data.value.unavailable"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
          data-test="profile-tracearr-unavailable"
          >{{ t(`profile.tracearr.unavailable_${link.data.value.unavailable}`) }}</v-alert
        >
        <v-select
          :model-value="selected"
          :items="items"
          :label="t('profile.tracearr.account')"
          :placeholder="t('profile.tracearr.none')"
          :disabled="link.data.value.unavailable !== null && selected === null"
          :loading="setLink.isPending.value"
          clearable
          persistent-placeholder
          data-test="profile-tracearr-account"
          @update:model-value="(key: string | null) => setLink.mutate(key ?? null)"
        />
        <div
          v-if="syncText"
          class="d-flex align-center ga-2 text-body-small"
          data-test="profile-tracearr-sync"
        >
          <v-progress-circular v-if="pending" indeterminate size="14" width="2" color="service" />
          <span :class="link.data.value.sync?.error ? 'text-error' : 'text-muted'">{{
            link.data.value.sync?.error ? t('profile.tracearr.sync_error') : syncText
          }}</span>
        </div>
      </template>
    </v-card-text>
    <v-card-actions v-if="session.isAdmin && link.data.value?.linked" class="justify-end px-4 pb-4">
      <v-btn
        :prepend-icon="msSync"
        :loading="resync.isPending.value"
        color="service-text"
        variant="tonal"
        data-test="profile-tracearr-resync"
        @click="resync.mutate()"
        >{{ t('profile.tracearr.resync') }}</v-btn
      >
    </v-card-actions>
  </v-card>
</template>
