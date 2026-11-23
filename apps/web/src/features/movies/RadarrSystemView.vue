<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Système Radarr (`media/radarr_system.html.twig`) : page commune `ArrSystemView`.
import ArrSystemView from '../../components/ArrSystemView.vue';
import RadarrNav from './RadarrNav.vue';
import { moviesApi } from './movies-api';
</script>

<template>
  <ArrSystemView
    service="radarr"
    title-key="media.arr_system.title_radarr"
    :load="moviesApi.system"
  >
    <template #nav><RadarrNav /></template>
  </ArrSystemView>
</template>
