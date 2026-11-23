<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Affiche la file des messages éphémères (`useNotifyStore`), un à la fois.
// Sur mobile, en haut de l'écran (P5b.4) : en bas, il recouvrait les boutons
// d'une feuille du bas, la barre basse et le FAB.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useNotifyStore } from '../app/stores/notify';

const { t } = useI18n();
const notify = useNotifyStore();
const { smAndDown } = useDisplay();
const current = computed(() => notify.queue[0]);
const COLORS = { success: 'success', error: 'error', info: undefined } as const;
</script>

<template>
  <v-snackbar
    v-if="current"
    :key="current.id"
    :model-value="true"
    :color="COLORS[current.kind]"
    :timeout="current.kind === 'error' ? 6000 : 4000"
    :location="smAndDown ? 'top' : 'bottom'"
    role="status"
    @update:model-value="notify.dismiss(current.id)"
  >
    {{ t(current.key, current.values ?? {}) }}
    <template #actions>
      <v-btn variant="text" @click="notify.dismiss(current.id)">{{
        t('common.action.close')
      }}</v-btn>
    </template>
  </v-snackbar>
</template>
