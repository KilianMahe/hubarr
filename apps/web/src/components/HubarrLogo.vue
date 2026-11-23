<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Logo de Hubarr : un moyeu (lecture) relié à six services en orbite, sur la
// couleur d'accent du thème (même dessin que public/favicon.svg).
import { APP_NAME } from '@hubarr/shared';

withDefaults(defineProps<{ size?: number; withName?: boolean }>(), { size: 32, withName: true });
</script>

<template>
  <span class="d-inline-flex align-center ga-3">
    <span
      class="hubarr-logo__mark bg-primary d-inline-flex align-center justify-center"
      :style="{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.3)}px`,
      }"
      aria-hidden="true"
    >
      <svg :width="size * 0.8" :height="size * 0.8" viewBox="56 56 400 400" fill="#fff">
        <circle
          cx="256"
          cy="256"
          r="150"
          fill="none"
          stroke="#fff"
          stroke-opacity="0.22"
          stroke-width="10"
        />
        <g stroke="#fff" stroke-opacity="0.6" stroke-width="16" stroke-linecap="round">
          <line x1="256" y1="256" x2="256" y2="106" />
          <line x1="256" y1="256" x2="385.9" y2="181" />
          <line x1="256" y1="256" x2="385.9" y2="331" />
          <line x1="256" y1="256" x2="256" y2="406" />
          <line x1="256" y1="256" x2="126.1" y2="331" />
          <line x1="256" y1="256" x2="126.1" y2="181" />
        </g>
        <circle cx="256" cy="106" r="34" />
        <circle cx="385.9" cy="181" r="34" />
        <circle cx="385.9" cy="331" r="34" />
        <circle cx="256" cy="406" r="34" />
        <circle cx="126.1" cy="331" r="34" />
        <circle cx="126.1" cy="181" r="34" />
        <circle cx="256" cy="256" r="72" />
        <polygon
          class="hubarr-logo__play"
          points="238,226 288,256 238,286"
          stroke-width="8"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span v-if="withName" class="text-title-large font-weight-bold">{{ APP_NAME }}</span>
  </span>
</template>

<style scoped>
.hubarr-logo__play {
  fill: rgb(var(--v-theme-primary));
  stroke: rgb(var(--v-theme-primary));
}
</style>
