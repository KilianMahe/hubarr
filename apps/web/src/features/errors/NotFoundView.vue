<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { mdiMapMarkerQuestionOutline } from '@mdi/js';
import { useI18n } from 'vue-i18n';
import EmptyState from '../../components/EmptyState.vue';

const { t } = useI18n();
</script>

<template>
  <v-container>
    <EmptyState
      :icon="mdiMapMarkerQuestionOutline"
      :title="t('error.404.title')"
      :text="t('error.404.message')"
    >
      <v-btn :to="{ name: 'home' }" color="service" variant="flat">{{
        t('error.action.home')
      }}</v-btn>
    </EmptyState>
  </v-container>
</template>
