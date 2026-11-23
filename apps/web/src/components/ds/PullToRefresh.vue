<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Tirer pour rafraîchir (écrans tactiles) : un geste vers le bas depuis le
// haut de la page, au-delà du seuil, émet `refresh` ; indicateur circulaire
// pendant `loading`. Sans effet à la souris et quand la page a défilé.
import { mdiRefresh } from '@mdi/js';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { pullDistance, PULL_THRESHOLD } from './pull';

const props = defineProps<{ loading?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ refresh: [] }>();
const { t } = useI18n();

const startY = ref<number | null>(null);
const offset = ref(0);
const ready = computed(() => offset.value >= PULL_THRESHOLD);

function scrollTop(): number {
  return document.scrollingElement?.scrollTop ?? window.scrollY;
}
function onStart(event: TouchEvent): void {
  if (props.disabled || props.loading || scrollTop() > 0) return;
  startY.value = event.touches[0]?.clientY ?? null;
}
function onMove(event: TouchEvent): void {
  if (startY.value === null) return;
  const y = event.touches[0]?.clientY;
  if (y === undefined) return;
  offset.value = pullDistance(y - startY.value);
}
function onEnd(): void {
  if (startY.value !== null && ready.value) emit('refresh');
  startY.value = null;
  offset.value = 0;
}
</script>

<template>
  <div
    class="ptr"
    @touchstart.passive="onStart"
    @touchmove.passive="onMove"
    @touchend="onEnd"
    @touchcancel="onEnd"
  >
    <div
      v-if="offset > 0 || loading"
      class="ptr__indicator"
      :style="{ height: `${loading ? PULL_THRESHOLD : offset}px` }"
      role="status"
      :aria-label="t(ready ? 'common.ds.release_to_refresh' : 'common.ds.pull_to_refresh')"
      data-test="pull-to-refresh"
    >
      <v-progress-circular v-if="loading" indeterminate size="24" width="3" color="service" />
      <v-icon
        v-else
        :icon="mdiRefresh"
        :color="ready ? 'service' : 'muted'"
        :style="{ transform: `rotate(${offset * 3}deg)` }"
      />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.ptr__indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
</style>
