<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Champ de mot de passe avec affichage masquable (connexion, assistant, profil).
import { mdiEye, mdiEyeOff } from '@mdi/js';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({ inheritAttrs: false });
const model = defineModel<string>({ required: true });
const { t } = useI18n();
const visible = ref(false);
</script>

<template>
  <v-text-field
    v-bind="$attrs"
    v-model="model"
    :type="visible ? 'text' : 'password'"
    spellcheck="false"
    autocapitalize="off"
  >
    <template #append-inner>
      <v-btn
        :icon="visible ? mdiEyeOff : mdiEye"
        :aria-label="t('setup.step.admin.toggle_visibility')"
        :aria-pressed="visible"
        size="small"
        variant="text"
        density="comfortable"
        @click="visible = !visible"
      />
    </template>
  </v-text-field>
</template>
