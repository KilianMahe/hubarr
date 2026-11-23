<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// « Général » de Prowlarr (`prowlarr/general.html.twig`, n° 276-277).
import ProwlarrConfigView from '../ProwlarrConfigView.vue';
import { GENERAL_SECTIONS } from '../config-sections';
</script>

<template>
  <ProwlarrConfigView path="/general" :sections="GENERAL_SECTIONS" prefix="prowlarr.general" />
</template>
