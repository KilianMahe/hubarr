<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts" generic="T extends string">
// Sélecteur du mode d'affichage (P5c.2, V14) : le même menu sur mobile et sur
// desktop ; sur desktop, le bouton porte aussi le libellé du mode courant.
import { mdiCheck, mdiMenuDown } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import type { ViewModeOption } from './types';

const props = defineProps<{
  options: ViewModeOption<T>[];
  /** Libellé accessible du menu (« Affichage »). */
  label: string;
  /** Préfixe des `data-test` : `<testId>-menu`, puis `view-<mode>` pour chaque entrée. */
  testId: string;
}>();
const model = defineModel<T>({ required: true });
const { mdAndUp } = useDisplay();
const { t } = useI18n();
const accessibleLabel = computed(() =>
  t('common.labelled_value', { label: props.label, value: current.value?.label ?? '' }),
);
const choose = (option: ViewModeOption<T>) => {
  model.value = option.value;
};
const current = computed(
  () => props.options.find((option) => option.value === model.value) ?? props.options[0],
);
</script>

<template>
  <v-menu location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-if="mdAndUp"
        v-bind="menuProps"
        :prepend-icon="current?.icon"
        :append-icon="mdiMenuDown"
        variant="tonal"
        rounded="pill"
        size="small"
        :aria-label="accessibleLabel"
        :data-test="`${testId}-menu`"
        >{{ current?.label }}</v-btn
      >
      <v-btn
        v-else
        v-bind="menuProps"
        :icon="current?.icon"
        variant="text"
        size="small"
        :aria-label="accessibleLabel"
        :title="current?.label"
        :data-test="`${testId}-menu`"
      />
    </template>
    <v-list density="compact" :selected="[model]" color="service-text" :aria-label="label">
      <v-list-subheader>{{ label }}</v-list-subheader>
      <v-list-item
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :prepend-icon="option.icon"
        :title="option.label"
        :data-test="`view-${option.value}`"
        @click="choose(option)"
      >
        <template v-if="option.value === model" #append>
          <v-icon :icon="mdiCheck" size="small" />
        </template>
      </v-list-item>
    </v-list>
  </v-menu>
</template>
