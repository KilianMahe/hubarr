<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Dialogue d'édition des pages d'administration (P3b) : plein écran sur
// mobile, contenu défilant, message d'erreur en tête, actions en pied
// (Annuler et Enregistrer, plus les actions propres au formulaire).
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import DialogTitle from '../../components/DialogTitle.vue';

const open = defineModel<boolean>({ required: true });
withDefaults(
  defineProps<{
    title: string;
    error?: string | null;
    saving?: boolean;
    saveLabel?: string | undefined;
    maxWidth?: number;
    /** Masque le bouton Enregistrer (dialogue en lecture seule). */
    hideSave?: boolean;
  }>(),
  { error: null, saving: false, saveLabel: undefined, maxWidth: 720, hideSave: false },
);
const emit = defineEmits<{ save: [] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();
</script>

<template>
  <v-dialog
    v-model="open"
    :fullscreen="smAndDown"
    :max-width="smAndDown ? undefined : maxWidth"
    scrollable
  >
    <v-card data-test="arr-admin-dialog">
      <DialogTitle :title="title" @close="open = false" />
      <v-card-text>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
          data-test="arr-admin-dialog-error"
          >{{ error }}</v-alert
        >
        <slot />
      </v-card-text>
      <v-divider />
      <v-card-actions class="flex-wrap">
        <slot name="extra" />
        <v-spacer />
        <v-btn variant="text" data-test="arr-admin-dialog-cancel" @click="open = false">{{
          t('common.action.cancel')
        }}</v-btn>
        <v-btn
          v-if="!hideSave"
          color="service"
          variant="flat"
          :loading="saving"
          data-test="arr-admin-dialog-save"
          @click="emit('save')"
          >{{ saveLabel ?? t('common.action.save') }}</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
