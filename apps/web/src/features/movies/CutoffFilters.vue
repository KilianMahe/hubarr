<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Filtres du cutoff (P5c.5, V6) : recherche par titre et profil de qualité,
// pour Radarr et Sonarr.
import { mdiMagnify } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  profiles: { id: number; name: string }[];
  profile: number;
  placeholder: string;
}>();
const emit = defineEmits<{ 'update:profile': [profile: number | null] }>();
const search = defineModel<string | null>('search', { required: true });
const { t } = useI18n();
const items = computed(() => [
  { value: 0, title: t('media.arr_lists.profile_all') },
  ...props.profiles.map((entry) => ({ value: entry.id, title: entry.name })),
]);
</script>

<template>
  <div class="cutoff-filters mb-3">
    <v-filter-field
      v-model="search"
      :prepend-inner-icon="mdiMagnify"
      :placeholder="placeholder"
      :aria-label="placeholder"
      density="compact"
      variant="outlined"
      clearable
      data-test="cutoff-search"
    />
    <v-filter-select
      :model-value="profile"
      :items="items"
      :label="t('media.arr_lists.profile')"
      density="compact"
      variant="outlined"
      data-test="cutoff-profile"
      @update:model-value="(value: number | null) => emit('update:profile', value)"
    />
  </div>
</template>

<style scoped>
.cutoff-filters {
  display: grid;
  grid-template-columns: minmax(0, 420px) minmax(0, 260px);
  gap: 12px;
}
@media (max-width: 600px) {
  .cutoff-filters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
