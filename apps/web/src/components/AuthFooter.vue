<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Pied des écrans hors session (connexion, assistant) : licence et code source.
import { APP_NAME, SOURCE_CODE_URL } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="text-center text-body-small text-muted mt-6">
    {{ APP_NAME }} &copy; {{ year }} · AGPL-3.0 ·
    <a :href="SOURCE_CODE_URL" target="_blank" rel="noopener" class="text-muted">{{
      t('footer.source_code')
    }}</a>
  </footer>
</template>
