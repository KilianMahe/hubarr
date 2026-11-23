<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section « À propos » : version courante seule (pas de vérification des mises
// à jour), environnement d'exécution, liens.
import { SOURCE_CODE_URL, UPSTREAM_PROJECT_URL, type AboutInfo } from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { docsHref } from '../../app/navigation';

const props = defineProps<{ about: AboutInfo }>();
const { t, locale } = useI18n();

const size = computed(() =>
  new Intl.NumberFormat(locale.value, {
    style: 'unit',
    unit: 'kilobyte',
    maximumFractionDigits: 0,
  }).format(props.about.databaseSize / 1024),
);
const serverTime = computed(() =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(props.about.serverTime),
  ),
);
const rows = computed(() => [
  { label: t('admin.about.field.version'), value: props.about.version },
  { label: 'Node.js', value: props.about.nodeVersion },
  { label: t('admin.about.field.database'), value: `${props.about.databasePath} (${size.value})` },
  {
    label: t('admin.about.field.server_time'),
    value: `${serverTime.value} · ${props.about.timezone}`,
  },
]);
</script>

<template>
  <section id="section-about" data-section="about">
    <h2 class="text-title-large mb-1">{{ t('admin.about.title') }}</h2>
    <p class="text-body-medium text-muted mb-4">{{ t('admin.about.description') }}</p>
    <v-card variant="outlined" class="mb-4">
      <v-list density="comfortable" class="bg-transparent">
        <v-list-item
          v-for="row in rows"
          :key="row.label"
          :title="row.label"
          :subtitle="row.value"
        />
      </v-list>
    </v-card>
    <div class="text-title-small mb-2">{{ t('admin.about.content.title') }}</div>
    <p class="text-body-medium mb-4">
      {{ t('admin.about.content.users', { count: about.userCount }) }}
    </p>
    <div class="text-title-small mb-2">{{ t('admin.about.links.title') }}</div>
    <div class="d-flex flex-wrap ga-2">
      <v-btn :href="SOURCE_CODE_URL" target="_blank" rel="noopener" variant="tonal">{{
        t('admin.about.links.source')
      }}</v-btn>
      <v-btn :href="docsHref(locale)" target="_blank" rel="noopener" variant="tonal">{{
        t('admin.about.links.docs')
      }}</v-btn>
      <v-btn :href="UPSTREAM_PROJECT_URL" target="_blank" rel="noopener" variant="tonal">{{
        t('admin.about.links.upstream')
      }}</v-btn>
    </div>
  </section>
</template>
