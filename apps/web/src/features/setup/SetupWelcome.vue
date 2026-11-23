<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Étape 1 de l'assistant (`setup/welcome.html.twig`) : langue de l'instance,
// présentation, puis le compte administrateur.
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@hubarr/shared';
import { mdiDownload, mdiMagnify, mdiMovieOpen, mdiStarFourPoints } from '@mdi/js';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../app/api/client';
import { setLocale } from '../../app/plugins/i18n';
import { useNotifyStore } from '../../app/stores/notify';
import HubarrLogo from '../../components/HubarrLogo.vue';

const { t, locale } = useI18n();
const notify = useNotifyStore();
const saving = ref(false);

const FEATURES = [
  { icon: mdiMovieOpen, key: 'setup.step.welcome.features.media' },
  { icon: mdiMagnify, key: 'setup.step.welcome.features.indexers' },
  { icon: mdiDownload, key: 'setup.step.welcome.features.downloads' },
  { icon: mdiStarFourPoints, key: 'setup.step.welcome.features.discovery' },
];
const languages = SUPPORTED_LOCALES.map((code) => ({
  value: code,
  title: t(`setup.step.welcome.language.${code}`),
}));

/** Langue gardée en session, puis promue langue de l'instance avec l'admin. */
async function changeLocale(value: string): Promise<void> {
  if (!isLocale(value)) return;
  const next: Locale = value;
  saving.value = true;
  try {
    await api.post('/api/setup/locale', { locale: next });
    await setLocale(next);
  } catch {
    notify.error('error.generic.message');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-card-text>
    <div class="d-flex justify-end">
      <v-select
        :model-value="locale"
        :items="languages"
        :label="t('setup.step.welcome.language_label')"
        :loading="saving"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 180px"
        data-test="setup-locale"
        @update:model-value="changeLocale"
      />
    </div>
    <div class="text-center py-6">
      <HubarrLogo :size="72" :with-name="false" />
      <h1 class="text-headline-medium mt-4 mb-2">{{ t('setup.step.welcome.title') }}</h1>
      <p class="text-body-large text-muted mx-auto" style="max-width: 460px">
        {{ t('setup.step.welcome.subtitle') }}
      </p>
    </div>
    <v-row density="compact">
      <v-col v-for="feature in FEATURES" :key="feature.key" cols="6" sm="3">
        <v-sheet color="surface-alt" rounded="lg" class="pa-3 text-center h-100">
          <v-icon :icon="feature.icon" color="service" class="mb-2" />
          <div class="text-label-large">{{ t(feature.key) }}</div>
        </v-sheet>
      </v-col>
    </v-row>
  </v-card-text>
  <v-divider />
  <v-card-actions class="justify-end pa-4">
    <v-btn
      :to="{ name: 'setup-admin' }"
      color="service"
      variant="flat"
      size="large"
      data-test="setup-start"
      >{{ t('setup.step.welcome.cta') }}</v-btn
    >
  </v-card-actions>
</template>
