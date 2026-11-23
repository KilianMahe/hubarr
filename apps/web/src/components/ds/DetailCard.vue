<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'une fiche en page (synopsis, fichier, saisons, historique…) :
// titre à icône facultative, actions de la carte à droite, contenu.
defineProps<{ title: string; icon?: string; titleColor?: string }>();
</script>

<template>
  <v-card variant="flat" border class="detail-card">
    <div class="detail-card__head">
      <h2 class="detail-card__title" :class="titleColor ? `text-${titleColor}` : undefined">
        <v-icon v-if="icon" :icon="icon" size="18" />
        {{ title }}
      </h2>
      <div v-if="$slots.actions" class="detail-card__actions"><slot name="actions" /></div>
    </div>
    <slot />
  </v-card>
</template>

<style scoped>
.detail-card {
  padding: 16px;
}
.detail-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.detail-card__title {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}
.detail-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
