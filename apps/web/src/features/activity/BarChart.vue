<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Graphique en barres empilées (SVG, sans bibliothèque) : remplace les
// graphiques Chart.js de l'original. Une barre par catégorie, une couleur par
// série, légende, valeur au survol (`title`), étiquettes clairsemées quand
// les catégories sont nombreuses. Le SVG s'étire à la largeur de la carte :
// les étiquettes de l'axe sont donc en HTML sous le graphique, une colonne par
// catégorie, pour ne pas être déformées (P5c.7, V8). Sur un écran étroit
// (P5d.7, V32), le nombre d'étiquettes suit la largeur réelle du graphique :
// chacune couvre les colonnes jusqu'à la suivante et se tronque au besoin.
import type { Chart } from '@hubarr/shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTheme } from 'vuetify';
import { SERIES_COLORS, stackChart } from './activity-api';

const props = withDefaults(
  defineProps<{ chart: Chart; height?: number; format?: (v: number) => string }>(),
  {
    height: 200,
    format: (v: number) => String(v),
  },
);
const theme = useTheme();
const WIDTH = 600;
const stack = computed(() => stackChart(props.chart));
const step = computed(() => WIDTH / Math.max(1, props.chart.categories.length));
// Largeur réelle (ResizeObserver) ; 600 px tant qu'elle est inconnue (tests).
const root = ref<HTMLElement | null>(null);
const width = ref(WIDTH);
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (root.value === null || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    if (entry !== undefined && entry.contentRect.width > 0) width.value = entry.contentRect.width;
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
const labelEvery = computed(() => {
  const count = props.chart.categories.length;
  const longest = Math.max(3, ...props.chart.categories.map((category) => category.length));
  // ~6,5 px par caractère à 11 px, plafonné : les plus longues se tronquent.
  const labelPx = Math.min(longest, 12) * 6.5 + 8;
  const fit = Math.max(1, Math.floor(width.value / labelPx));
  return Math.max(1, Math.ceil(count / 12), Math.ceil(count / fit));
});
/** Étiquettes affichées : une toutes les `labelEvery` catégories, sur autant de colonnes. */
const labels = computed(() =>
  props.chart.categories.flatMap((category, i) =>
    i % labelEvery.value === 0
      ? [{ category, span: Math.min(labelEvery.value, props.chart.categories.length - i) }]
      : [],
  ),
);
const color = (index: number): string => {
  const value =
    theme.current.value.colors[SERIES_COLORS[index % SERIES_COLORS.length] ?? 'primary'];
  return typeof value === 'string' ? value : '#888';
};

const bars = computed(() => {
  const plot = props.height;
  return props.chart.categories.map((category, i) => {
    let y = plot;
    const segments = props.chart.series.map((serie, s) => {
      const value = serie.data[i] ?? 0;
      const h = (value / stack.value.max) * (plot - 4);
      y -= h;
      return {
        y,
        h,
        color: color(s),
        title: `${serie.name} — ${category} : ${props.format(value)}`,
      };
    });
    return { category, x: i * step.value, segments };
  });
});
</script>

<template>
  <div ref="root" data-test="bar-chart">
    <svg
      :viewBox="`0 0 ${WIDTH} ${height}`"
      width="100%"
      :height="height"
      preserveAspectRatio="none"
      role="img"
    >
      <g v-for="bar in bars" :key="bar.category">
        <rect
          v-for="(segment, s) in bar.segments"
          :key="s"
          :x="bar.x + step * 0.15"
          :y="segment.y"
          :width="step * 0.7"
          :height="Math.max(0, segment.h)"
          :fill="segment.color"
          rx="2"
        >
          <title>{{ segment.title }}</title>
        </rect>
      </g>
    </svg>
    <div
      class="bar-chart__axis"
      :style="{ gridTemplateColumns: `repeat(${Math.max(1, bars.length)}, minmax(0, 1fr))` }"
      aria-hidden="true"
      data-test="bar-chart-axis"
    >
      <span
        v-for="label in labels"
        :key="label.category"
        class="bar-chart__label"
        :style="{ gridColumn: `span ${label.span}` }"
        >{{ label.category }}</span
      >
    </div>
    <div v-if="chart.series.length > 1" class="d-flex flex-wrap ga-3 mt-1 text-caption">
      <span v-for="(serie, s) in chart.series" :key="serie.name" class="d-flex align-center ga-1">
        <span class="legend-dot" :style="{ background: color(s) }" />{{ serie.name }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.bar-chart__axis {
  display: grid;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.2;
  opacity: 0.7;
}
.bar-chart__label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-align: center;
  padding-inline: 1px;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
</style>
