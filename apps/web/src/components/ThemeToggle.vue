<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Bascule clair/sombre, proposée en mode classique seulement (un préréglage a
// une palette fixe), comme dans l'original.
import { msDarkMode, msLightMode } from './symbols';
import { useI18n } from 'vue-i18n';
import { useHubarrTheme } from '../app/theme/controller';

const { t } = useI18n();
const theme = useHubarrTheme();
</script>

<template>
  <v-btn
    v-if="theme.toggleable.value"
    :icon="theme.dark.value ? msLightMode : msDarkMode"
    :aria-label="t('topbar.theme.toggle')"
    :title="theme.dark.value ? t('topbar.theme.label_light') : t('topbar.theme.label_dark')"
    variant="text"
    data-test="theme-toggle"
    @click="theme.toggle()"
  />
</template>
