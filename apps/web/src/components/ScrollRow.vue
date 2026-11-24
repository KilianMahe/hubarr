<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Rangée horizontale de cartes, commune à toutes les pages (découverte,
// tableau de bord, étagères, fiches, Bazarr) : pas de barre de défilement, des
// flèches aux bords (grand écran et mobile), chacune masquée en bout de
// rangée ; le doigt fait toujours glisser la rangée. Une flèche avance des
// trois quarts de la largeur visible.
import { msChevronLeft, msChevronRight } from './symbols';
import { onBeforeUnmount, onMounted, onUpdated, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Attributs (rôle ARIA, `aria-hidden`, `data-test`) portés par la piste, pas
// par l'enveloppe qui contient aussi les flèches.
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    /** Largeur d'une colonne (`120px`), sinon celle de chaque élément. */
    itemWidth?: string;
    gap?: number;
  }>(),
  { itemWidth: 'max-content', gap: 12 },
);
const { t } = useI18n();
const track = ref<HTMLElement | null>(null);
const canPrev = ref(false);
const canNext = ref(false);

/** Marge (px) en deçà de laquelle on est considéré en bout de rangée. */
const EDGE = 4;
function update(): void {
  const el = track.value;
  if (el === null) return;
  canPrev.value = el.scrollLeft > EDGE;
  canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE;
}
function scroll(direction: 1 | -1): void {
  const el = track.value;
  if (el) el.scrollBy({ left: direction * el.clientWidth * 0.75, behavior: 'smooth' });
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  update();
  if ('ResizeObserver' in window && track.value !== null) {
    observer = new ResizeObserver(update);
    observer.observe(track.value);
  }
});
// Cartes chargées ou retirées : la rangée peut devenir défilante.
onUpdated(update);
onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<template>
  <div class="scroll-row">
    <div
      ref="track"
      v-bind="$attrs"
      class="scroll-row__track"
      :style="{ gridAutoColumns: props.itemWidth, gap: `${props.gap}px` }"
      @scroll.passive="update"
    >
      <slot />
    </div>
    <v-btn
      v-show="canPrev"
      class="scroll-row__arrow scroll-row__arrow--prev"
      :icon="msChevronLeft"
      size="small"
      variant="elevated"
      :aria-label="t('decouverte.scroll.prev')"
      data-test="scroll-prev"
      @click="scroll(-1)"
    />
    <v-btn
      v-show="canNext"
      class="scroll-row__arrow scroll-row__arrow--next"
      :icon="msChevronRight"
      size="small"
      variant="elevated"
      :aria-label="t('decouverte.scroll.next')"
      data-test="scroll-next"
      @click="scroll(1)"
    />
  </div>
</template>

<style scoped>
.scroll-row {
  position: relative;
}
.scroll-row__track {
  display: grid;
  grid-auto-flow: column;
  justify-content: start;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  padding-bottom: 4px;
  /* Pas de barre de défilement : les flèches (et le doigt) la remplacent. */
  scrollbar-width: none;
}
.scroll-row__track::-webkit-scrollbar {
  display: none;
}
.scroll-row__track > :slotted(*) {
  min-width: 0;
  scroll-snap-align: start;
}
.scroll-row__arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}
.scroll-row__arrow--prev {
  left: 4px;
}
.scroll-row__arrow--next {
  right: 4px;
}
</style>
