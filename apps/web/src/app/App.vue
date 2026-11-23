<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Racine : une seule `v-app` (mise en page Vuetify), les layouts des routes
// dedans (shell, assistant, connexion) et les messages éphémères. Applique la
// densité choisie (`display_ui_density`) à tous les composants.
import { watch } from 'vue';
import AppSnackbar from '../components/AppSnackbar.vue';
import { useDensity } from './plugins/vuetify';
import { useSessionStore } from './stores/session';

const session = useSessionStore();
const setDensity = useDensity();
watch(
  () => session.preferences.display_ui_density,
  (density) => {
    setDensity(density === 'compact' ? 'compact' : 'comfortable');
  },
  { immediate: true },
);
</script>

<template>
  <v-app>
    <router-view />
    <AppSnackbar />
  </v-app>
</template>
