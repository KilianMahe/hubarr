<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ligne de métadonnées : chaque enfant est séparé du suivant par « · », avec
// retour à la ligne propre. Remplace les suites de <span> sans séparateur
// (textes collés de qBittorrent, P5b.1 Q1/Q2).
withDefaults(defineProps<{ tag?: string; muted?: boolean }>(), { tag: 'div', muted: true });
</script>

<template>
  <component :is="tag" class="meta-line text-body-small" :class="{ 'text-muted': muted }">
    <span class="meta-line__items"><slot /></span>
  </component>
</template>

<style scoped>
/* Chaque élément porte son séparateur à gauche ; la marge négative du conteneur
   rejette celui du premier élément de chaque ligne hors de la zone visible. */
.meta-line {
  display: block;
  min-width: 0;
  overflow: hidden;
}
.meta-line__items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  row-gap: 2px;
  /* séparateur (16 px) + écart interne de l'élément (4 px) */
  margin-left: -20px;
}
.meta-line__items > :deep(*) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.meta-line__items > :deep(*)::before {
  content: '·';
  display: inline-block;
  width: 16px;
  text-align: center;
  opacity: 0.6;
}
</style>
