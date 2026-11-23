<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Étiquettes en masse (`modal-bulk-tags`) : étiquettes de l'instance à cocher
// et action ajouter / retirer / remplacer. Partagé par les films et les séries.
import { APPLY_TAGS_MODES, type ApplyTagsMode, type ArrTag } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from './ResponsiveDialog.vue';

const open = defineModel<boolean>({ required: true });
const props = withDefaults(
  defineProps<{
    count: number;
    tags: ArrTag[] | undefined;
    loading: boolean;
    /** Préfixe des clés de traduction (`media.films.bulk`, `media.series.bulk`). */
    i18nPrefix?: string;
  }>(),
  { i18nPrefix: 'media.films.bulk' },
);
const emit = defineEmits<{ save: [tags: number[], mode: ApplyTagsMode] }>();
const { t } = useI18n();

const chosen = ref<number[]>([]);
const mode = ref<ApplyTagsMode>('add');
watch(open, (value) => {
  if (value) {
    chosen.value = [];
    mode.value = 'add';
  }
});
const modes = computed(() =>
  APPLY_TAGS_MODES.map((value) => ({ value, title: t(`${props.i18nPrefix}.tags_${value}`) })),
);
const empty = computed(() => (props.tags ?? []).length === 0);
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t(`${i18nPrefix}.tags_title`)" :max-width="460">
    <div class="text-body-medium mb-1">{{ t(`${i18nPrefix}.tags_label`) }}</div>
    <p v-if="tags !== undefined && empty" class="text-body-small text-muted">
      {{ t(`${i18nPrefix}.no_tag_defined`) }}
    </p>
    <v-progress-linear v-else-if="tags === undefined" indeterminate color="service" />
    <v-checkbox
      v-for="tag in tags ?? []"
      :key="tag.id"
      v-model="chosen"
      :value="tag.id"
      :label="tag.label"
      density="compact"
      hide-details
      color="service"
    />
    <v-select
      v-model="mode"
      :items="modes"
      :label="t(`${i18nPrefix}.tags_action`)"
      density="compact"
      variant="outlined"
      hide-details
      class="mt-3"
    />
    <p class="text-body-small text-muted mt-3">
      {{ t(`${i18nPrefix}.selected_hint`, { count }) }}
    </p>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t(`${i18nPrefix}.cancel`) }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        :loading="loading"
        :disabled="chosen.length === 0"
        data-test="bulk-tags-save"
        @click="emit('save', [...chosen], mode)"
        >{{ t(`${i18nPrefix}.apply`) }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>
