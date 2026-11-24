<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ligne dense d'un média : vignette (affiche ou image), titre, ligne de
// métadonnées, puces (slot `chips`), action à droite (slot `append`). En mode
// sélection, une pastille cochée remplace le clic d'ouverture.
import { msCheckCircleFill, msRadioButtonUnchecked } from '../symbols';
import MetaLine from './MetaLine.vue';

withDefaults(
  defineProps<{
    title: string;
    image?: string | null;
    /** Vignette paysage (16:9) au lieu d'une affiche (2:3). */
    landscape?: boolean;
    selectMode?: boolean;
    selected?: boolean;
  }>(),
  { image: null },
);
const emit = defineEmits<{ open: []; select: [event: MouseEvent | KeyboardEvent] }>();
</script>

<template>
  <div class="media-item" :class="{ 'media-item--selected': selected }" data-test="media-item">
    <button
      type="button"
      class="media-item__hit"
      :aria-pressed="selectMode ? selected : undefined"
      @click="selectMode ? emit('select', $event) : emit('open')"
    >
      <v-icon
        v-if="selectMode"
        :icon="selected ? msCheckCircleFill : msRadioButtonUnchecked"
        :color="selected ? 'service' : 'muted'"
        aria-hidden="true"
      />
      <div class="media-item__thumb" :class="{ 'media-item__thumb--landscape': landscape }">
        <img v-if="image" :src="image" alt="" loading="lazy" />
        <slot name="thumb" />
      </div>
      <div class="media-item__body">
        <div class="text-body-large font-weight-medium text-truncate" :title="title">
          {{ title }}
        </div>
        <MetaLine v-if="$slots.meta"><slot name="meta" /></MetaLine>
        <div v-if="$slots.chips" class="media-item__chips"><slot name="chips" /></div>
        <slot />
      </div>
    </button>
    <div v-if="$slots.append" class="media-item__append"><slot name="append" /></div>
  </div>
</template>

<style scoped>
.media-item {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding-right: 8px;
}
.media-item--selected {
  background: rgba(var(--v-theme-service), 0.12);
}
.media-item__hit {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0 6px 16px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.media-item__thumb {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 66px;
  border-radius: 8px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-alt));
}
.media-item__thumb--landscape {
  width: 88px;
  height: 50px;
}
.media-item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.media-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.media-item__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.media-item__append {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
