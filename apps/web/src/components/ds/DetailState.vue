<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// État d'un titre en tête de la colonne d'une fiche (téléchargé, manquant,
// en cours…) : encadré teinté de la couleur de l'état, icône, libellé et
// précision (suivi, qualité, taille).
defineProps<{ color: string; icon: string; title: string; subtitle?: string; tip?: string }>();
</script>

<template>
  <div class="detail-state" :class="`text-${color}`" :title="tip">
    <v-icon :icon="icon" size="22" />
    <div class="detail-state__text">
      <div class="detail-state__title">{{ title }}</div>
      <div v-if="subtitle" class="detail-state__sub">{{ subtitle }}</div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.detail-state {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid currentColor;
  overflow: hidden;
}
.detail-state::before {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  opacity: 0.12;
}
.detail-state__text {
  position: relative;
  min-width: 0;
  color: rgb(var(--v-theme-on-surface));
}
.detail-state__title {
  font-weight: 500;
}
.detail-state__sub {
  font-size: 0.8rem;
  opacity: 0.75;
}
</style>
