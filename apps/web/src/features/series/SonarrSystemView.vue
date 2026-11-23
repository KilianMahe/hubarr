<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Système Sonarr (`media/sonarr_system.html.twig`) : page commune `ArrSystemView`.
import ArrSystemView from '../../components/ArrSystemView.vue';
import SonarrNav from './SonarrNav.vue';
import { seriesApi } from './series-api';
</script>

<template>
  <ArrSystemView
    service="sonarr"
    title-key="media.arr_system.title_sonarr"
    :load="seriesApi.system"
  >
    <template #nav><SonarrNav /></template>
  </ArrSystemView>
</template>
