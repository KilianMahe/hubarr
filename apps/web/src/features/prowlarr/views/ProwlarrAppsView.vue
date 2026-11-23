<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Applications de Prowlarr (`prowlarr/apps.html.twig`, n° 250) : applications
// connectées, puis profils de synchronisation (n° 302-305).
import AppProfilesCard from '../AppProfilesCard.vue';
import ProwlarrProvidersView from '../ProwlarrProvidersView.vue';
</script>

<template>
  <ProwlarrProvidersView family="applications">
    <AppProfilesCard />
  </ProwlarrProvidersView>
</template>
