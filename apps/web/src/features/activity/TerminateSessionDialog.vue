<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Confirmation de l'arrêt d'une lecture Tracearr (admins) : message facultatif
// affiché au spectateur, puis relecture de l'activité (page et tableau de
// bord). Une lecture déjà terminée (404) a son propre message ; un refus de
// Tracearr (Plex Pass absent, session inconnue…) affiche sa raison.
import { TERMINATE_REASON_MAX } from '@hubarr/shared';
import { useQueryClient } from '@tanstack/vue-query';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../../app/api/client';
import { apiErrorText } from '../../app/api/error-text';
import { useNotifyStore } from '../../app/stores/notify';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { tracearrApi } from './activity-api';

const props = defineProps<{ sessionId: string; title: string }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ terminated: [] }>();
const { t } = useI18n();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const reason = ref('');
const busy = ref(false);
watch(open, (value) => {
  if (value) reason.value = '';
});

async function confirm(): Promise<void> {
  busy.value = true;
  try {
    const text = reason.value.trim();
    await tracearrApi.terminate(props.sessionId, text === '' ? {} : { reason: text });
    notify.success('activity.terminate.done');
    open.value = false;
    emit('terminated');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notify.info('activity.terminate.gone');
      open.value = false;
      emit('terminated');
    } else
      notify.error('activity.terminate.error_reason', {
        reason: apiErrorText(error, t, 'activity.terminate.error_unknown'),
      });
  } finally {
    busy.value = false;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tracearr', 'activity'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'activity'] }),
    ]);
  }
}
</script>

<template>
  <ResponsiveDialog
    v-model="open"
    :title="t('activity.terminate.title')"
    title-color="error"
    :max-width="460"
  >
    <p class="text-body-large mb-4" data-test="session-terminate-message">
      {{ t('activity.terminate.message', { title }) }}
    </p>
    <v-text-field
      v-model="reason"
      :label="t('activity.terminate.reason')"
      :hint="t('activity.terminate.reason_hint')"
      persistent-hint
      :maxlength="TERMINATE_REASON_MAX"
      counter
      data-test="session-terminate-reason"
      @keydown.enter.prevent="confirm"
    />
    <template #actions>
      <v-btn variant="text" :disabled="busy" @click="open = false">{{
        t('common.action.cancel')
      }}</v-btn>
      <v-btn
        color="error"
        variant="flat"
        :loading="busy"
        data-test="session-terminate-confirm"
        @click="confirm"
        >{{ t('activity.terminate.confirm') }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>
