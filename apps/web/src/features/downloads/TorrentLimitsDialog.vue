<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Limites de vitesse globales (Hubarr : routes `global-limit` et
// `speed-mode` de l'original, sans écran) : Mo/s, vide ou 0 = illimité ;
// mode de vitesse alternatif pour qBittorrent.
import { TORRENT_CAPABILITIES, type TorrentClientId, type TorrentStats } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { apiErrorText } from '../../app/api/error-text';
import { useNotifyStore } from '../../app/stores/notify';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { bytesToMbps, mbpsToBytes } from './torrents';
import { torrentsApi } from './torrents-api';
import { useTorrentI18n } from './use-torrent-i18n';

const props = defineProps<{ client: TorrentClientId; stats: TorrentStats | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ changed: [] }>();
const notify = useNotifyStore();
const { t, tk, say } = useTorrentI18n(() => props.client);
const caps = computed(() => TORRENT_CAPABILITIES[props.client]);
const dl = ref('');
const up = ref('');
const busy = ref(false);
watch(open, (value) => {
  if (!value) return;
  dl.value = bytesToMbps(props.stats?.dlLimit ?? null);
  up.value = bytesToMbps(props.stats?.upLimit ?? null);
});

async function run(task: () => Promise<unknown>, successKey: string): Promise<void> {
  busy.value = true;
  try {
    await task();
    notify.success(successKey);
    emit('changed');
  } catch (error) {
    say.error(apiErrorText(error, t, 'usenet.toast.error'));
  } finally {
    busy.value = false;
  }
}

const save = () =>
  run(async () => {
    await torrentsApi(props.client).globalLimit({
      dl: mbpsToBytes(dl.value),
      up: mbpsToBytes(up.value),
    });
    open.value = false;
  }, 'usenet.toast.speed_set');
const toggleMode = () =>
  run(() => torrentsApi(props.client).speedMode(), 'qbittorrent.toast.action_sent');
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t('usenet.toolbar.speed_limit')" :max-width="460">
    <div data-test="torrent-limits">
      <v-text-field
        v-model="dl"
        :label="`↓ ${t('usenet.toolbar.speed_limit_placeholder')}`"
        :placeholder="t('usenet.toolbar.speed_limit_unlimited')"
        inputmode="decimal"
        density="compact"
        data-test="limit-dl"
      />
      <v-text-field
        v-model="up"
        :label="`↑ ${t('usenet.toolbar.speed_limit_placeholder')}`"
        :placeholder="t('usenet.toolbar.speed_limit_unlimited')"
        inputmode="decimal"
        density="compact"
        data-test="limit-up"
      />
      <v-switch
        v-if="caps.speedMode"
        :model-value="stats?.altSpeed === true"
        :label="tk('toolbar.speed_mode')"
        color="service"
        hide-details
        :disabled="busy"
        data-test="speed-mode"
        @update:model-value="toggleMode"
      />
    </div>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t('common.action.cancel') }}</v-btn>
      <v-btn color="service" variant="flat" :loading="busy" data-test="limits-save" @click="save">{{
        t('common.action.save')
      }}</v-btn>
    </template>
  </ResponsiveDialog>
</template>
