<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Index provisoire d'un service (P1.4) : bannière s'il est injoignable, puis
// emplacement en attendant ses écrans (P2 à P4).
import { msBuild } from '../../components/symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { serviceOfRoute } from '../../app/router/guards';
import { serviceLabel } from '../../app/services';
import EmptyState from '../../components/EmptyState.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';

const { t } = useI18n();
const route = useRoute();
const service = computed(() => serviceOfRoute(route));
const slug = computed(() =>
  typeof route.params.slug === 'string' ? route.params.slug : undefined,
);
const title = computed(() =>
  service.value === null
    ? t(route.meta.titleKey ?? 'common.status.coming_soon')
    : serviceLabel(service.value),
);
</script>

<template>
  <v-container style="max-width: 1100px">
    <ServiceDownBanner v-if="service" :service="service" :instance="slug" />
    <EmptyState
      :icon="msBuild"
      :title="t('service.placeholder.title', { service: title })"
      :text="t('service.placeholder.text')"
    />
  </v-container>
</template>
