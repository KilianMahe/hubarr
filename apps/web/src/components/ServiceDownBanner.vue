<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Bannière d'un service injoignable (`_service_banner` d'origine), affichée en
// tête de l'index du service : non configuré, identifiants refusés, hôte bloqué
// (SABnzbd) ou injoignable. « Réessayer » relance la détection (un admin vide
// aussi le disjoncteur côté serveur).
import { serviceDiagnosisResponseSchema, type ServiceId } from '@hubarr/shared';
import { msErrorFill } from './symbols';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../app/api/client';
import { SERVICES_HEALTH_KEY, useServicesHealth } from '../app/health';
import { serviceLabel } from '../app/services';
import { useSessionStore } from '../app/stores/session';

const props = defineProps<{ service: ServiceId; instance?: string | undefined }>();
const { t } = useI18n();
const session = useSessionStore();
const queryClient = useQueryClient();
const health = useServicesHealth();
const retrying = ref(false);

const down = computed(() => {
  const data = health.data.value;
  if (data === undefined) return false;
  if ((props.service === 'radarr' || props.service === 'sonarr') && props.instance !== undefined) {
    return (
      data.instances[props.service].find((row) => row.slug === props.instance)?.state === false
    );
  }
  return data.services[props.service] === false;
});

const diagnosis = useQuery({
  queryKey: computed(() => ['health', 'diagnose', props.service, props.instance ?? null]),
  queryFn: ({ signal }) =>
    api.get(
      `/api/health/diagnose/${props.service}${props.instance === undefined ? '' : `?instance=${encodeURIComponent(props.instance)}`}`,
      serviceDiagnosisResponseSchema,
      signal,
    ),
  enabled: down,
});

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

const content = computed(() => {
  const name = serviceLabel(props.service);
  const category = diagnosis.data.value?.category ?? 'network';
  const url = diagnosis.data.value?.url ?? null;
  // L'URL vient de la configuration : échappée avant d'entrer dans le HTML du message.
  const values = { service: escapeHtml(name), url: url === null ? '' : escapeHtml(url) };
  if (category === 'unconfigured') {
    return {
      title: 'title_not_configured',
      body: 'body_not_configured',
      cta: 'cta_configure',
      values,
    };
  }
  if (category === 'auth')
    return { title: 'title_auth', body: 'body_auth', cta: 'cta_edit', values };
  if (category === 'host_whitelist') {
    return {
      title: 'title_host_whitelist',
      body: url === null ? 'body_host_whitelist' : 'body_host_whitelist_url',
      cta: 'cta_edit',
      values,
    };
  }
  return {
    title: 'title_unreachable',
    body: url === null ? 'body_unreachable_no_url' : 'body_unreachable_url',
    cta: null,
    values,
  };
});

async function retry(): Promise<void> {
  retrying.value = true;
  try {
    if (session.isAdmin) {
      await api
        .post(`/api/admin/settings/health/invalidate/${props.service}`)
        .catch(() => undefined);
    }
    await queryClient.invalidateQueries({ queryKey: SERVICES_HEALTH_KEY });
    await queryClient.invalidateQueries({ queryKey: ['health', 'diagnose', props.service] });
  } finally {
    retrying.value = false;
  }
}
</script>

<template>
  <v-alert
    v-if="down"
    type="error"
    variant="tonal"
    :icon="msErrorFill"
    class="mb-4"
    data-test="service-down-banner"
  >
    <v-alert-title>{{
      t(`error.service_banner.${content.title}`, { service: serviceLabel(service) })
    }}</v-alert-title>
    <!-- Message du catalogue ; ses valeurs sont échappées ci-dessus. -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div class="mt-1" v-html="t(`error.service_banner.${content.body}`, content.values)" />
    <div class="d-flex flex-wrap ga-2 mt-3">
      <v-btn
        variant="flat"
        color="error"
        :loading="retrying"
        data-test="service-retry"
        @click="retry"
      >
        {{ t('error.service_banner.cta_retry') }}
      </v-btn>
      <v-btn
        v-if="session.isAdmin && content.cta"
        variant="text"
        :to="{ name: 'settings', hash: '#section-services' }"
      >
        {{ t(`error.service_banner.${content.cta}`, { service: serviceLabel(service) }) }}
      </v-btn>
    </div>
  </v-alert>
</template>
