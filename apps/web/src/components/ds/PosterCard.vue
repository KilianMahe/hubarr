<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Carte d'affiche (grilles et murs) : puce d'état en clair en haut à gauche,
// action en haut à droite (slot `action`), qualité en bas à droite, badges en
// bas à gauche (slot `badges`), barre de progression facultative ; légende
// titre + sous-titre sauf en mode `compact`. Coins sans chevauchement (F3).
import { msCheck } from '../symbols';
import QualityChip from './QualityChip.vue';
import StatusChip from './StatusChip.vue';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string | null;
    image?: string | null;
    status?: { label: string; color: string; title?: string } | null;
    quality?: string | null;
    progress?: number | null;
    compact?: boolean;
    selectMode?: boolean;
    selected?: boolean;
  }>(),
  { subtitle: null, image: null, status: null, quality: null, progress: null },
);
const emit = defineEmits<{ open: []; select: [event: MouseEvent | KeyboardEvent] }>();
</script>

<template>
  <div
    class="poster-card"
    :class="{ 'poster-card--selected': selected, 'poster-card--compact': compact }"
    data-test="poster-card"
  >
    <button
      type="button"
      class="poster-card__hit"
      :aria-pressed="selectMode ? selected : undefined"
      :title="subtitle ? `${title} (${subtitle})` : title"
      @click="selectMode ? emit('select', $event) : emit('open')"
    >
      <div class="poster-card__poster">
        <img v-if="image" :src="image" :alt="title" loading="lazy" />
        <div v-else class="poster-card__no-poster text-body-small">{{ title }}</div>
        <StatusChip
          v-if="status && !compact"
          overlay
          class="poster-card__status"
          :label="status.label"
          :color="status.color"
          :title="status.title"
        />
        <span
          v-else-if="status"
          class="poster-card__dot"
          :class="`bg-${status.color}`"
          role="img"
          :aria-label="status.title ?? status.label"
          :title="status.title ?? status.label"
        />
        <QualityChip
          v-if="quality && !compact"
          overlay
          :quality="quality"
          class="poster-card__quality"
        />
        <v-progress-linear
          v-if="progress !== null"
          :model-value="progress"
          color="service"
          height="4"
          absolute
          location="bottom"
          class="poster-card__progress"
        />
        <span v-if="selectMode" class="poster-card__check" aria-hidden="true">
          <v-icon v-if="selected" :icon="msCheck" size="16" />
        </span>
      </div>
      <div v-if="!compact" class="poster-card__caption">
        <div class="text-body-medium font-weight-medium text-truncate">{{ title }}</div>
        <div class="text-body-small text-muted text-truncate">{{ subtitle ?? '—' }}</div>
      </div>
    </button>
    <div v-if="$slots.badges && !selectMode" class="poster-card__badges">
      <slot name="badges" />
    </div>
    <div v-if="$slots.action" class="poster-card__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.poster-card {
  position: relative;
  min-width: 0;
}
.poster-card__hit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 0;
  cursor: pointer;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}
.poster-card__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-alt));
  outline: 3px solid transparent;
  outline-offset: -3px;
  transition: outline-color 0.15s;
}
.poster-card--selected .poster-card__poster {
  outline-color: rgb(var(--v-theme-service));
}
.poster-card__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.poster-card__no-poster {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8px;
  text-align: center;
}
.poster-card__status {
  position: absolute;
  top: 6px;
  left: 6px;
  max-width: calc(100% - 44px);
}
.poster-card__dot {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.45);
}
.poster-card__quality {
  position: absolute;
  right: 6px;
  bottom: 8px;
  max-width: calc(100% - 44px);
}
.poster-card__check {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.35);
  color: rgb(var(--v-theme-on-service));
}
.poster-card--selected .poster-card__check {
  background: rgb(var(--v-theme-service));
  border-color: rgb(var(--v-theme-service));
}
.poster-card__caption {
  min-width: 0;
}
.poster-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: calc(100% - 12px);
  position: absolute;
  left: 6px;
  /* Au-dessus de la légende (2 lignes) : bas gauche de l'affiche. */
  bottom: 54px;
  z-index: 2;
}
.poster-card--compact .poster-card__badges {
  bottom: 8px;
}
.poster-card__action {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 2;
}
/* Bouton posé sur l'affiche (suivi) : lisible sur une image claire. */
.poster-card__action :slotted(.poster-monitor) {
  display: inline-flex;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  color: #fff;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.7));
}
</style>
