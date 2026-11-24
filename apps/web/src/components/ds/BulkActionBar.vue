<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Barre d'actions de la sélection, collée en bas du contenu : compteur, actions
// (slot), « tout sélectionner » facultatif et sortie de la sélection.
// Sur mobile (P5b.4, E3), le compteur, la sortie et « tout sélectionner »
// passent dans la barre du haut, qui devient la barre contextuelle de la
// sélection (`useSelectionChrome`) ; la barre ne garde que les actions.
import { msClose } from '../symbols';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useSelectionChrome, type SelectionState } from '../../app/service-chrome';

const props = defineProps<{ count: number; selectAllLabel?: string }>();
const emit = defineEmits<{ clear: []; selectAll: [] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();

useSelectionChrome(() => {
  if (!smAndDown.value) return null;
  const state: SelectionState = {
    count: props.count,
    clear: () => {
      emit('clear');
    },
  };
  if (props.selectAllLabel) {
    state.selectAll = () => {
      emit('selectAll');
    };
    state.selectAllLabel = props.selectAllLabel;
  }
  return state;
});
</script>

<template>
  <v-sheet
    class="bulk-bar"
    :class="{ 'bulk-bar--mobile': smAndDown }"
    elevation="8"
    rounded="lg"
    data-test="bulk-bar"
  >
    <template v-if="!smAndDown">
      <v-btn
        :icon="msClose"
        size="small"
        variant="text"
        :aria-label="t('common.ds.clear_selection')"
        :title="t('common.ds.clear_selection')"
        data-test="bulk-clear"
        @click="emit('clear')"
      />
      <span class="text-title-small text-no-wrap me-2" data-test="bulk-count">{{
        t('common.ds.selected', { count })
      }}</span>
    </template>
    <div class="bulk-bar__actions">
      <slot />
    </div>
    <v-btn
      v-if="selectAllLabel && !smAndDown"
      size="small"
      variant="text"
      data-test="bulk-select-all"
      @click="emit('selectAll')"
      >{{ selectAllLabel }}</v-btn
    >
  </v-sheet>
</template>

<style scoped>
.bulk-bar {
  position: sticky;
  bottom: 16px;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 16px;
  padding: 6px 12px 6px 6px;
}
.bulk-bar--mobile {
  padding: 8px;
}
.bulk-bar__actions {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
