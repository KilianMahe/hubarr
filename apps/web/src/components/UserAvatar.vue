<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Avatar d'un compte : la photo envoyée, sinon les initiales du nom affiché
// (l'original appelait un service tiers, exclu par la CSP : MEMOIRE D44).
import type { AuthUser } from '@hubarr/shared';
import { computed } from 'vue';

const props = withDefaults(defineProps<{ user: AuthUser; size?: number }>(), { size: 36 });

const initials = computed(() => {
  const words = props.user.displayName.split(/[\s@._-]+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[1]] : [props.user.displayName];
  return letters
    .map((word) => (word ?? '').charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
});
</script>

<template>
  <v-avatar :size="size" color="service-container">
    <v-img v-if="user.avatarUrl" :src="user.avatarUrl" alt="" cover />
    <span
      v-else
      class="text-on-service-container font-weight-medium"
      :style="{ fontSize: `${Math.round(size * 0.4)}px` }"
      aria-hidden="true"
      >{{ initials }}</span
    >
  </v-avatar>
</template>
