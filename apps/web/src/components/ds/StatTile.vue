<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Tuile de statistique : valeur en grand, unité, libellé, couleur d'accent.
// Cliquable (filtre) quand le parent écoute `click` ; `active` la met en avant.
defineProps<{
  value: string | number;
  label: string;
  unit?: string | undefined;
  color?: string | undefined;
  icon?: string | undefined;
  active?: boolean;
  clickable?: boolean;
  dense?: boolean;
}>();
defineEmits<{ click: [] }>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="stat-tile"
    :class="{
      'stat-tile--active': active,
      'stat-tile--clickable': clickable,
      'stat-tile--dense': dense,
    }"
    :style="color ? { '--stat-color': `rgb(var(--v-theme-${color}))` } : undefined"
    :aria-pressed="clickable ? active : undefined"
    data-test="stat-tile"
    @click="clickable && $emit('click')"
  >
    <span class="stat-tile__value">
      <v-icon v-if="icon" :icon="icon" size="18" class="me-1" />{{ value
      }}<small v-if="unit" class="stat-tile__unit">{{ unit }}</small>
    </span>
    <span class="stat-tile__label">{{ label }}</span>
  </component>
</template>

<style scoped>
.stat-tile {
  --stat-color: rgb(var(--v-theme-on-surface));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
  font: inherit;
  text-align: left;
}
.stat-tile--dense {
  padding: 6px 10px;
}
.stat-tile--clickable {
  cursor: pointer;
}
.stat-tile--clickable:hover,
.stat-tile--clickable:focus-visible {
  border-color: var(--stat-color);
}
.stat-tile--active {
  border-color: var(--stat-color);
  background: color-mix(in srgb, var(--stat-color) 14%, rgb(var(--v-theme-surface)));
}
.stat-tile__value {
  display: inline-flex;
  align-items: baseline;
  font-size: 1.5rem;
  line-height: 1.2;
  font-weight: 500;
  color: var(--stat-color);
  white-space: nowrap;
}
.stat-tile--dense .stat-tile__value {
  font-size: 1.15rem;
}
.stat-tile__unit {
  margin-left: 3px;
  font-size: 0.75rem;
  font-weight: 400;
  opacity: 0.8;
}
.stat-tile__label {
  font-size: 0.75rem;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
