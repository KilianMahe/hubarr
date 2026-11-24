<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Historique paginé d'un client Usenet (`usenet/history.html.twig`, route
// n° 599) : 50 entrées par page, page dans l'URL (`?page=`), « Page p / n ».
import { msArrowBack } from '../../components/symbols';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import UsenetHistoryList from './UsenetHistoryList.vue';
import { usenetApi, usenetKeys } from './usenet';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';
import EmptyState from '../../components/EmptyState.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const client = computed(() => (route.params.client === 'nzbget' ? 'nzbget' : 'sabnzbd'));
const label = computed(() => (client.value === 'nzbget' ? 'NZBGet' : 'SABnzbd'));
const page = computed(() => Math.max(1, Number.parseInt(String(route.query.page ?? '1'), 10) || 1));
const history = useQuery({
  queryKey: computed(() => usenetKeys.history(client.value, page.value)),
  queryFn: ({ signal }) => usenetApi(client.value).history(page.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const go = (target: number) => router.push({ query: { ...route.query, page: String(target) } });
</script>

<template>
  <v-container fluid data-test="usenet-history-page">
    <ServiceDownBanner :service="client" />
    <ServiceHeader
      :service="client"
      :title="label"
      :subtitle="
        history.data.value
          ? `${t('usenet.history.title')} · ${t('usenet.history.count', { count: history.data.value.total })}`
          : t('usenet.history.title')
      "
    >
      <v-btn
        :prepend-icon="msArrowBack"
        variant="text"
        size="small"
        :to="{ name: 'usenet', params: { client } }"
        >{{ t('common.action.back') }}</v-btn
      >
    </ServiceHeader>
    <v-alert v-if="history.isError.value" type="error" variant="tonal" density="compact">{{
      t('usenet.error_unreachable', { client: label })
    }}</v-alert>
    <v-progress-linear v-else-if="history.isPending.value" indeterminate color="service" />
    <template v-else-if="history.data.value">
      <v-card variant="flat" border>
        <EmptyState
          v-if="history.data.value.items.length === 0"
          inline
          :title="t('usenet.history.empty')"
        />
        <UsenetHistoryList v-else :client="client" :items="history.data.value.items" />
      </v-card>
      <div
        v-if="history.data.value.totalPages > 1"
        class="d-flex align-center justify-center ga-3 mt-3"
      >
        <v-btn
          variant="tonal"
          :disabled="history.data.value.page <= 1"
          @click="go(history.data.value.page - 1)"
          >{{ t('usenet.history.prev') }}</v-btn
        >
        <span class="text-body-medium" data-test="usenet-history-page-of">{{
          t('usenet.history.page_of', {
            current: history.data.value.page,
            total: history.data.value.totalPages,
          })
        }}</span>
        <v-btn
          variant="tonal"
          :disabled="history.data.value.page >= history.data.value.totalPages"
          data-test="usenet-history-next"
          @click="go(history.data.value.page + 1)"
          >{{ t('usenet.history.next') }}</v-btn
        >
      </div>
    </template>
  </v-container>
</template>
