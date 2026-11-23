<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Mise en page des pages de Bazarr (`bazarr/_shell.html.twig`) : bannière
// « injoignable », en-tête de service (titre unique, sous-titre), navigation, préchauffage de l'index,
// alerte de chargement, contenu.
import { useI18n } from 'vue-i18n';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import BazarrNav from './BazarrNav.vue';
import WarmingPanel from './WarmingPanel.vue';
import { SERVICE_SETTINGS } from '@hubarr/shared';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';

defineProps<{ loading?: boolean; error?: boolean; warming?: boolean; title?: string }>();
const emit = defineEmits<{ reload: [] }>();
const { t } = useI18n();
</script>

<template>
  <v-container fluid data-test="bazarr-page">
    <ServiceDownBanner service="bazarr" />
    <ServiceHeader
      service="bazarr"
      :title="SERVICE_SETTINGS.bazarr.label"
      :subtitle="title ?? t('bazarr.subtitle')"
    >
      <template v-if="$slots.actions" #default><slot name="actions" /></template>
    </ServiceHeader>
    <BazarrNav />
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="bazarr-error"
      >{{ t('error.service_banner.title_unreachable', { service: 'Bazarr' }) }}</v-alert
    >
    <v-progress-linear v-else-if="loading" indeterminate color="service" class="mb-3" />
    <WarmingPanel v-else-if="warming" @reload="emit('reload')" />
    <slot v-else />
  </v-container>
</template>
