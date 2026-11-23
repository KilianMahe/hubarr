<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Puce d'état d'un service dans les paramètres (`svc-status` d'origine).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import type { HealthState } from './service-status';

const props = defineProps<{
  saved: boolean;
  disabled: boolean;
  probe: boolean;
  health: HealthState;
}>();
const { t } = useI18n();
const { xs } = useDisplay();

const chip = computed((): { key: string; color: string } | null => {
  if (!props.saved) return { key: 'admin.services.state.new', color: 'muted' };
  if (props.disabled) return { key: 'admin.services.state.disabled', color: 'muted' };
  if (!props.probe) return null;
  switch (props.health) {
    case 'checking':
      return { key: 'admin.services.state.checking', color: 'muted' };
    case 'up':
      return { key: 'admin.services.state.up', color: 'success' };
    case 'down':
      return { key: 'admin.services.state.down', color: 'error' };
    case 'unknown':
      return { key: 'admin.services.state.unknown', color: 'muted' };
  }
  return null;
});
</script>

<template>
  <!-- Très petit écran : pastille seule, libellé en infobulle et pour les lecteurs d'écran (R2). -->
  <span
    v-if="chip && xs"
    class="status-dot flex-shrink-0 me-2"
    :class="`bg-${chip.color}`"
    role="img"
    :aria-label="t(chip.key)"
    :title="t(chip.key)"
  />
  <v-chip
    v-else-if="chip"
    :color="chip.color"
    size="small"
    variant="tonal"
    class="flex-shrink-0 me-2"
    label
  >
    {{ t(chip.key) }}
  </v-chip>
</template>

<style scoped>
.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
