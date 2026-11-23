<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// En-tête d'une vue de service : pastille du service, titre, sous-titre
// (instance · total, état du VPN, demandes en attente…), actions à droite.
// Seul titre de l'écran (P5b.1 E5, `app/page-header.ts`) : sur grand écran la
// barre du haut ne le répète pas ; sur mobile, il passe dans la barre du haut.
import type { ServiceId } from '@hubarr/shared';
import { useDisplay } from 'vuetify';
import { usePageHeader } from '../../app/page-header';
import ServiceLogo from '../../features/settings/ServiceLogo.vue';

const props = defineProps<{ service?: ServiceId; title: string; subtitle?: string | null }>();
const { smAndDown } = useDisplay();
usePageHeader(() => ({ title: props.title, subtitle: props.subtitle ?? null }));
</script>

<template>
  <header v-if="!smAndDown || $slots.default" class="service-header" data-test="service-header">
    <ServiceLogo v-if="service && !smAndDown" :service="service" :size="36" />
    <!-- Sur mobile, le titre et le sous-titre sont dans la barre du haut. -->
    <div v-if="!smAndDown" class="service-header__text">
      <h1 class="text-title-large text-truncate">{{ title }}</h1>
      <div v-if="subtitle || $slots.subtitle" class="text-body-small text-muted text-truncate">
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>
    <v-spacer v-else />
    <div v-if="$slots.default" class="service-header__actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.service-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  margin-bottom: 12px;
}
.service-header__text {
  flex: 1 1 auto;
  min-width: 0;
}
.service-header__text h1 {
  margin: 0;
  line-height: 1.25;
}
.service-header__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
</style>
