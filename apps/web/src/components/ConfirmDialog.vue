<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Confirmation d'une action : dialogue sur desktop, bottom sheet sur mobile.
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';

const open = defineModel<boolean>({ required: true });
withDefaults(
  defineProps<{ message: string; confirmLabel?: string | undefined; danger?: boolean }>(),
  {
    confirmLabel: undefined,
    danger: false,
  },
);
const emit = defineEmits<{ confirm: [] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();

function confirm(): void {
  open.value = false;
  emit('confirm');
}
</script>

<template>
  <component :is="smAndDown ? VBottomSheet : VDialog" v-model="open" max-width="420">
    <v-card>
      <v-card-text class="text-body-large pt-6" style="white-space: pre-line">{{
        message
      }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.action.cancel') }}</v-btn>
        <v-btn
          :color="danger ? 'error' : 'service'"
          variant="flat"
          data-test="confirm"
          @click="confirm"
          >{{ confirmLabel ?? t('common.action.confirm') }}</v-btn
        >
      </v-card-actions>
    </v-card>
  </component>
</template>
