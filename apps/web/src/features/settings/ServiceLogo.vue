<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Pastille d'un service : initiale sur la teinte du service (logos définitifs
// à venir, ATTRIBUTION.md ; maquettes P0.11).
import { SERVICE_ACCENTS, SERVICE_SETTINGS, readableOn, type ServiceId } from '@hubarr/shared';
import { computed } from 'vue';
import { useHubarrTheme } from '../../app/theme/controller';

const props = withDefaults(defineProps<{ service: ServiceId; size?: number }>(), { size: 36 });
const theme = useHubarrTheme();
const color = computed(() => SERVICE_ACCENTS[props.service][theme.dark.value ? 'dark' : 'light']);
const text = computed(() => readableOn(color.value));
</script>

<template>
  <v-avatar :size="size" :color="color" rounded="lg" class="font-weight-bold" aria-hidden="true">
    <span :style="{ color: text }">{{ SERVICE_SETTINGS[service].label.charAt(0) }}</span>
  </v-avatar>
</template>
