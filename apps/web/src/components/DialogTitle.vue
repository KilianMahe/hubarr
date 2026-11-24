<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// En-tête commun des dialogues et bottom sheets : titre (texte ou slot) et
// croix de fermeture à droite, toujours présente, pour fermer de la même façon
// partout (desktop comme mobile).
import { msClose } from './symbols';
import { useI18n } from 'vue-i18n';

defineProps<{ title?: string | undefined; titleClass?: string | undefined }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
</script>

<template>
  <div class="dialog-title d-flex align-start ga-2 pt-3 ps-6 pe-3">
    <div class="dialog-title__text text-title-large text-wrap flex-grow-1 pt-2" :class="titleClass">
      <slot>{{ title }}</slot>
    </div>
    <v-btn
      :icon="msClose"
      variant="text"
      size="small"
      class="flex-shrink-0"
      :aria-label="t('common.action.close')"
      data-test="dialog-close"
      @click="emit('close')"
    />
  </div>
</template>

<style scoped>
.dialog-title__text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
