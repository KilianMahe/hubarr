<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Puce d'état commune (téléchargé, manquant, en file, en pause, erreur…) :
// une seule forme dans toute l'application, couleur et icône facultative.
// `overlay` : version lisible posée sur une affiche.
defineProps<{
  label: string;
  color?: string | undefined;
  icon?: string | undefined;
  title?: string | undefined;
  overlay?: boolean;
  size?: 'x-small' | 'small';
}>();
</script>

<template>
  <span
    v-if="overlay"
    class="status-chip--overlay"
    :style="color ? { '--chip-color': `rgb(var(--v-theme-${color}))` } : undefined"
    :title="title"
    data-test="status-chip"
  >
    <v-icon v-if="icon" :icon="icon" size="12" />{{ label }}
  </span>
  <v-chip
    v-else
    :size="size ?? 'x-small'"
    label
    variant="tonal"
    :color="color"
    :prepend-icon="icon"
    :title="title"
    class="flex-shrink-0"
    data-test="status-chip"
    >{{ label }}</v-chip
  >
</template>

<style scoped>
.status-chip--overlay {
  --chip-color: rgb(var(--v-theme-on-surface));
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 2px 7px 2px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  background: rgba(0, 0, 0, 0.72);
  box-shadow: inset 3px 0 0 var(--chip-color);
}
</style>
