<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Fiche d'un indexeur (`modal-info-indexer` de `prowlarr/index.html.twig`) :
// détails et capacités de recherche, catégories, historique (chargé à
// l'ouverture de l'onglet) ; modifier et supprimer depuis la fiche.
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useFormat } from '../../app/format';
import { capabilityRows, categoryRows, indexerLinks, paramLabelKey } from './indexers';
import { prowlarrApi, prowlarrKeys } from './prowlarr-api';
import DialogTitle from '../../components/DialogTitle.vue';
import EmptyState from '../../components/EmptyState.vue';

const props = defineProps<{ indexerId: number | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ edit: [id: number]; delete: [id: number, name: string] }>();
const { t } = useI18n();
const format = useFormat();
const { smAndDown } = useDisplay();

const tab = ref<'details' | 'categories' | 'history'>('details');
watch(open, (value) => {
  if (value) tab.value = 'details';
});

const indexer = useQuery({
  queryKey: computed(() => prowlarrKeys.indexer(props.indexerId ?? 0)),
  queryFn: ({ signal }) => prowlarrApi.indexer(props.indexerId ?? 0, signal),
  enabled: computed(() => open.value && props.indexerId !== null),
  staleTime: 0,
  retry: false,
});
const history = useQuery({
  queryKey: computed(() => prowlarrKeys.history(props.indexerId ?? 0)),
  queryFn: ({ signal }) => prowlarrApi.indexerHistory(props.indexerId ?? 0, signal),
  enabled: computed(() => open.value && props.indexerId !== null && tab.value === 'history'),
  staleTime: 30_000,
  retry: false,
});

const data = computed(() => indexer.data.value ?? null);
const capabilities = computed(() => (data.value ? capabilityRows(data.value) : []));
const categories = computed(() => (data.value ? categoryRows(data.value) : []));
const links = computed(() => (data.value ? indexerLinks(data.value) : []));
const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : '—');
const privacyKey = computed(() =>
  data.value?.privacy === 'private'
    ? 'prowlarr.index.privacy_private'
    : data.value?.privacy === 'semiPrivate'
      ? 'prowlarr.index.privacy_semiprivate'
      : 'prowlarr.index.privacy_public',
);
const privacyColor = computed(() =>
  data.value?.privacy === 'private'
    ? 'error'
    : data.value?.privacy === 'semiPrivate'
      ? 'warning'
      : 'success',
);
const paramLabel = (param: string) => {
  const key = paramLabelKey(param);
  return key === null ? param : t(key);
};
const eventLabel = (type: string | null) =>
  type === 'indexerRss'
    ? t('prowlarr.index.info_event_rss')
    : type === 'indexerQuery'
      ? t('prowlarr.index.info_event_query')
      : (type ?? '—');
</script>

<template>
  <v-dialog
    v-model="open"
    :fullscreen="smAndDown"
    :max-width="smAndDown ? undefined : 760"
    scrollable
  >
    <v-card data-test="indexer-info">
      <DialogTitle :title="data?.name ?? t('prowlarr.nav.indexers')" @close="open = false" />
      <v-tabs v-model="tab" color="service-text" grow density="compact">
        <v-tab value="details" data-test="indexer-info-tab-details">{{
          t('prowlarr.index.info_tab_details')
        }}</v-tab>
        <v-tab value="categories" data-test="indexer-info-tab-categories">{{
          t('prowlarr.index.info_tab_categories')
        }}</v-tab>
        <v-tab value="history" data-test="indexer-info-tab-history">{{
          t('prowlarr.index.info_tab_history')
        }}</v-tab>
      </v-tabs>
      <v-divider />
      <v-card-text>
        <v-alert v-if="indexer.isError.value" type="error" variant="tonal" density="compact">{{
          t('prowlarr.common.error_unreachable')
        }}</v-alert>
        <v-progress-linear v-else-if="indexer.isPending.value" indeterminate color="service" />
        <template v-else-if="data">
          <v-window v-model="tab">
            <v-window-item value="details">
              <h3 class="text-title-small text-service-text mb-2">
                {{ t('prowlarr.index.info_details_heading') }}
              </h3>
              <dl class="indexer-info__details mb-4">
                <dt>{{ t('prowlarr.index.info_label_type') }}</dt>
                <dd>
                  <v-chip
                    size="x-small"
                    label
                    variant="tonal"
                    :color="data.protocol === 'usenet' ? 'info' : 'primary'"
                    >{{ data.protocol === 'usenet' ? 'Usenet' : 'Torrent' }}</v-chip
                  >
                </dd>
                <dt>{{ t('prowlarr.index.info_label_description') }}</dt>
                <dd>{{ text(data.description) }}</dd>
                <dt>{{ t('prowlarr.index.info_label_language') }}</dt>
                <dd>{{ text(data.language) }}</dd>
                <dt>{{ t('prowlarr.index.info_label_protocol') }}</dt>
                <dd>{{ text(data.protocol) }}</dd>
                <dt>{{ t('prowlarr.index.info_label_privacy') }}</dt>
                <dd>
                  <v-chip size="x-small" label variant="tonal" :color="privacyColor">{{
                    t(privacyKey)
                  }}</v-chip>
                </dd>
                <template v-if="links.length > 0">
                  <dt>{{ t('prowlarr.index.info_label_urls') }}</dt>
                  <dd class="indexer-info__links">
                    <template v-for="link in links" :key="link.url">
                      <a
                        v-if="link.href"
                        :href="link.href"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-muted"
                        >{{ link.url }}</a
                      >
                      <span v-else class="text-muted">{{ link.url }}</span>
                    </template>
                  </dd>
                </template>
              </dl>
              <h3 class="text-title-small text-service-text mb-2">
                {{ t('prowlarr.index.info_search_capabilities') }}
              </h3>
              <div
                v-for="row in capabilities"
                :key="row.labelKey"
                class="indexer-info__capability"
                data-test="indexer-capability"
              >
                <span class="text-body-medium text-muted">{{ t(row.labelKey) }}</span>
                <div class="d-flex flex-wrap ga-1">
                  <v-chip
                    v-if="row.supported !== undefined"
                    size="x-small"
                    label
                    variant="tonal"
                    :color="row.supported ? 'success' : undefined"
                    >{{
                      t(
                        row.supported
                          ? 'prowlarr.index.info_cap_supported'
                          : 'prowlarr.index.info_cap_unsupported',
                      )
                    }}</v-chip
                  >
                  <template v-else-if="(row.params ?? []).length > 0">
                    <v-chip
                      v-for="param in row.params"
                      :key="param"
                      size="x-small"
                      label
                      variant="tonal"
                      color="info"
                      >{{ paramLabel(param) }}</v-chip
                    >
                  </template>
                  <v-chip v-else size="x-small" label variant="tonal">{{
                    t('prowlarr.index.info_cap_unsupported')
                  }}</v-chip>
                </div>
              </div>
            </v-window-item>

            <v-window-item value="categories">
              <EmptyState
                v-if="categories.length === 0"
                inline
                :title="t('prowlarr.index.info_no_categories')"
              />
              <template v-else>
                <p class="text-body-small text-muted mb-2" data-test="indexer-categories-count">
                  {{ t('prowlarr.index.info_categories_count_tpl', { count: categories.length }) }}
                </p>
                <v-table density="compact">
                  <thead>
                    <tr>
                      <th style="width: 90px">{{ t('prowlarr.index.info_col_id') }}</th>
                      <th>{{ t('prowlarr.common.name') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in categories"
                      :key="`${row.id}-${row.sub}`"
                      :class="{ 'indexer-info__sub': row.sub }"
                    >
                      <td class="text-muted">{{ row.id }}</td>
                      <td :class="row.sub ? 'ps-6' : 'font-weight-medium'">{{ row.name }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </template>
            </v-window-item>

            <v-window-item value="history">
              <v-progress-linear v-if="history.isPending.value" indeterminate color="service" />
              <v-alert
                v-else-if="history.isError.value"
                type="error"
                variant="tonal"
                density="compact"
                >{{ t('prowlarr.common.error_unreachable') }}</v-alert
              >
              <p
                v-else-if="(history.data.value ?? []).length === 0"
                class="text-center text-muted py-4"
              >
                {{ t('prowlarr.index.info_no_history') }}
              </p>
              <v-table v-else density="compact">
                <thead>
                  <tr>
                    <th>{{ t('prowlarr.index.info_col_date') }}</th>
                    <th>{{ t('prowlarr.index.info_col_type') }}</th>
                    <th>{{ t('prowlarr.index.info_col_query') }}</th>
                    <th>{{ t('prowlarr.index.info_col_source') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="record in history.data.value"
                    :key="record.id"
                    data-test="indexer-history-row"
                  >
                    <td class="text-no-wrap text-muted">
                      {{ record.date ? format.dateTime(record.date) : '—' }}
                    </td>
                    <td>
                      <v-chip
                        size="x-small"
                        label
                        variant="tonal"
                        :color="
                          record.eventType === 'indexerRss'
                            ? 'info'
                            : record.eventType === 'indexerQuery'
                              ? 'primary'
                              : undefined
                        "
                        >{{ eventLabel(record.eventType) }}</v-chip
                      >
                    </td>
                    <td class="indexer-info__query">{{ record.query ?? '—' }}</td>
                    <td class="text-muted">{{ record.source ?? '—' }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-window-item>
          </v-window>
        </template>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn
          v-if="data && indexerId !== null"
          color="error"
          variant="text"
          data-test="indexer-info-delete"
          @click="emit('delete', indexerId, data.name ?? '')"
          >{{ t('prowlarr.common.delete') }}</v-btn
        >
        <v-spacer />
        <v-btn
          v-if="indexerId !== null"
          variant="tonal"
          color="service-text"
          data-test="indexer-info-edit"
          @click="emit('edit', indexerId)"
          >{{ t('prowlarr.common.edit') }}</v-btn
        >
        <v-btn variant="text" @click="open = false">{{ t('prowlarr.common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.indexer-info__details {
  display: grid;
  grid-template-columns: minmax(90px, 160px) 1fr;
  gap: 6px 12px;
}
.indexer-info__details dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.indexer-info__links {
  display: flex;
  flex-direction: column;
  word-break: break-all;
}
.indexer-info__capability {
  display: grid;
  grid-template-columns: minmax(110px, 160px) 1fr;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.indexer-info__sub {
  opacity: 0.8;
}
.indexer-info__query {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
