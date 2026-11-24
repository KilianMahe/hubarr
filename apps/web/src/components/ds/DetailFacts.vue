<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Chiffres clés d'une fiche (notes, qualité, taille…) en tuiles ; les valeurs
// absentes sont omises par l'appelant.
defineProps<{ facts: { key: string; label: string; value: string }[] }>();
</script>

<template>
  <dl v-if="facts.length > 0" class="detail-facts" data-test="detail-facts">
    <div v-for="fact in facts" :key="fact.key" class="detail-facts__tile">
      <dt>{{ fact.label }}</dt>
      <dd :title="fact.value">{{ fact.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.detail-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.detail-facts__tile {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
}
.detail-facts__tile dt {
  font-size: 0.75rem;
  opacity: 0.7;
}
.detail-facts__tile dd {
  margin: 0;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 959px) {
  .detail-facts {
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  }
}
</style>
