<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Navigation des pages d'une instance Radarr (`_radarr_nav.html.twig`) :
// bibliothèque, activité (historique, liste de blocage), recherchés (manquants,
// cutoff), découverte (collections), système.
import ArrNav from '../../components/ArrNav.vue';
import { RADARR_PAGES } from './radarr-pages';
defineProps<{ subtitle?: string | null }>();
</script>

<template>
  <ArrNav :pages="RADARR_PAGES" kind="radarr" :subtitle="subtitle" data-test="radarr-nav">
    <slot />
  </ArrNav>
</template>
