<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Mise en page des pages Seerr (`_jellyseerr_nav.html.twig`) : bannière
// « injoignable », en-tête de service (titre unique, sous-titre de la page,
// actions, P5b.1 E5), navigation (demandes, utilisateurs), chargement et
// erreur, contenu. Les réglages et le système s'ouvrent depuis les paramètres
// de Hubarr (P5c.4, D140) : lien de retour, puis onglets des groupes et des pages (P5d.3). Sur
// mobile (P5b.4), la barre basse remplace les onglets principaux.
import { SERVICE_SETTINGS } from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';
import ServiceSettingsNav from '../../components/ServiceSettingsNav.vue';

const props = defineProps<{
  title: string;
  /** Sous-titre de l'en-tête (demandes en attente…) ; à défaut, le titre de la page. */
  subtitle?: string | null | undefined;
  loading?: boolean;
  error?: boolean;
}>();
const { t } = useI18n();
const route = useRoute();
const { smAndDown } = useDisplay();
const settings = computed(() => String(route.name ?? '').startsWith('seerr-settings'));
const main = computed(() =>
  settings.value
    ? 'settings'
    : String(route.name ?? '').startsWith('seerr-user')
      ? 'users'
      : 'requests',
);
</script>

<template>
  <v-container fluid data-test="seerr-page">
    <ServiceDownBanner service="seerr" />
    <ServiceHeader
      service="seerr"
      :title="SERVICE_SETTINGS.seerr.label"
      :subtitle="props.subtitle ?? title"
    >
      <template v-if="$slots.actions" #default><slot name="actions" /></template>
    </ServiceHeader>
    <ServiceSettingsNav v-if="settings" />
    <v-tabs
      v-else-if="!smAndDown"
      :model-value="main"
      density="compact"
      color="service-text"
      class="mb-1"
      data-test="seerr-nav"
    >
      <v-tab value="requests" :to="{ name: 'seerr' }">{{ t('jellyseerr.nav.requests') }}</v-tab>
      <v-tab value="users" :to="{ name: 'seerr-users' }">{{ t('jellyseerr.nav.users') }}</v-tab>
    </v-tabs>
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      density="compact"
      class="my-3"
      data-test="seerr-error"
      >{{ t('jellyseerr.users.cannot_reach') }}</v-alert
    >
    <v-progress-linear v-else-if="loading" indeterminate color="service" class="my-3" />
    <slot v-else />
  </v-container>
</template>
