<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Rangée horizontale de cartes (sections de la découverte, du dashboard) :
// titre, lien facultatif, défilement par boutons sur grand écran et au doigt
// sur mobile.
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';

defineProps<{
  title: string;
  subtitle?: string;
  to?: RouteLocationRaw;
  linkLabel?: string;
  loading?: boolean;
}>();
const { t } = useI18n();
const row = ref<HTMLElement | null>(null);
function scroll(direction: 1 | -1): void {
  const el = row.value;
  if (el) el.scrollBy({ left: direction * el.clientWidth * 0.75, behavior: 'smooth' });
}
</script>

<template>
  <section class="mb-6">
    <div class="d-flex align-center mb-2 ga-2">
      <h2 class="text-title-large">{{ title }}</h2>
      <span v-if="subtitle" class="text-body-small text-muted">{{ subtitle }}</span>
      <v-spacer />
      <v-btn v-if="to && linkLabel" :to="to" variant="text" size="small">{{ linkLabel }}</v-btn>
      <v-btn
        class="d-none d-md-inline-flex"
        :icon="mdiChevronLeft"
        size="small"
        variant="text"
        :aria-label="t('decouverte.scroll.prev')"
        @click="scroll(-1)"
      />
      <v-btn
        class="d-none d-md-inline-flex"
        :icon="mdiChevronRight"
        size="small"
        variant="text"
        :aria-label="t('decouverte.scroll.next')"
        @click="scroll(1)"
      />
    </div>
    <div ref="row" class="media-row d-flex ga-3">
      <template v-if="loading">
        <v-skeleton-loader v-for="i in 7" :key="i" type="image" width="150" height="225" />
      </template>
      <slot v-else />
    </div>
  </section>
</template>

<style scoped>
.media-row {
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: 4px;
}
.media-row > :deep(*) {
  flex: 0 0 auto;
  scroll-snap-align: start;
}
</style>
