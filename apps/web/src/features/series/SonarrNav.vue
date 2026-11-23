<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Navigation des pages d'une instance Sonarr (`_sonarr_nav.html.twig`).
import ArrNav from '../../components/ArrNav.vue';
import { SONARR_PAGES } from './sonarr-pages';
defineProps<{ subtitle?: string | null }>();
</script>

<template>
  <ArrNav :pages="SONARR_PAGES" kind="sonarr" :subtitle="subtitle" data-test="sonarr-nav">
    <slot />
  </ArrNav>
</template>
