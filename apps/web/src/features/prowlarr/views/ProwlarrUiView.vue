<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// « Interface » de Prowlarr (`prowlarr/ui.html.twig`, n° 278-279).
import ProwlarrConfigView from '../ProwlarrConfigView.vue';
import { UI_SECTIONS } from '../config-sections';
</script>

<template>
  <ProwlarrConfigView path="/ui" :sections="UI_SECTIONS" prefix="prowlarr.ui" />
</template>
