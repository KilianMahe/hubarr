<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Étiquettes de Prowlarr (`prowlarr/tags.html.twig`, n° 275) : usage par
// indexeurs, applications et notifications (n° 296), création (n° 301),
// suppression confirmée (n° 286 ; refusée si l'étiquette sert encore).
import { arrTagItemSchema, prowlarrTagDetailSchema } from '@hubarr/shared';
import { mdiDelete, mdiPlus } from '@mdi/js';
import { ref } from 'vue';
import { z } from 'zod';
import { api } from '../../../app/api/client';
import { fillLegacy } from '../../../app/legacy-template';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import { useConfirmAction } from '../../arr-admin/admin-api';
import ProwlarrPage from '../ProwlarrPage.vue';
import { PROWLARR_API, useProwlarrPage } from '../prowlarr-api';
import EmptyState from '../../../components/EmptyState.vue';

const { query, feedback, error, run, t } = useProwlarrPage(
  '/tags/detail',
  z.array(prowlarrTagDetailSchema),
);
const confirm = useConfirmAction();
const label = ref('');
const creating = ref(false);

async function create(): Promise<void> {
  const value = label.value.trim();
  if (value === '') return;
  creating.value = true;
  const ok = await run(
    () => api.post(`${PROWLARR_API}/tag/create`, { label: value }, arrTagItemSchema),
    'prowlarr.tags.feedback_error',
    t('prowlarr.tags.feedback_created'),
  );
  if (ok) label.value = '';
  creating.value = false;
}

function askDelete(id: number, tag: string): void {
  confirm.ask(fillLegacy(t('prowlarr.tags.confirm_delete_tpl'), { LABEL: tag }), async () => {
    const ok = await run(
      () => api.post(`${PROWLARR_API}/tags/${id}/supprimer`, {}),
      'prowlarr.tags.delete_in_use',
    );
    if (!ok) feedback.value = { type: 'error', text: t('prowlarr.tags.delete_in_use') };
  });
}
</script>

<template>
  <ProwlarrPage
    v-model:feedback="feedback"
    :title="t('prowlarr.tags.title')"
    :count="query.data.value?.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <v-card variant="flat" border>
      <v-card-text>
        <form class="d-flex ga-2 mb-3" @submit.prevent="create">
          <v-text-field
            v-model="label"
            :placeholder="t('prowlarr.tags.new_placeholder')"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 320px"
            data-test="tag-new"
          />
          <v-btn
            type="submit"
            color="service"
            :prepend-icon="mdiPlus"
            :loading="creating"
            data-test="tag-add"
            >{{ t('prowlarr.tags.add_btn') }}</v-btn
          >
        </form>
        <EmptyState
          v-if="(query.data.value ?? []).length === 0"
          inline
          :title="t('prowlarr.tags.empty')"
        />
        <v-table v-else density="compact">
          <thead>
            <tr>
              <th>{{ t('prowlarr.tags.col_tag') }}</th>
              <th>{{ t('prowlarr.tags.col_indexers') }}</th>
              <th>{{ t('prowlarr.tags.col_apps') }}</th>
              <th>{{ t('prowlarr.tags.col_notifications') }}</th>
              <th class="text-end">{{ t('prowlarr.tags.col_actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tag in query.data.value" :key="tag.id" data-test="tag-row">
              <td>
                <v-chip size="small" variant="tonal" color="service-text">{{ tag.label }}</v-chip>
              </td>
              <td class="text-muted">{{ tag.indexerIds.length }}</td>
              <td class="text-muted">{{ tag.applicationIds.length }}</td>
              <td class="text-muted">{{ tag.notificationIds.length }}</td>
              <td class="text-end">
                <v-btn
                  :icon="mdiDelete"
                  size="small"
                  variant="text"
                  color="error"
                  :aria-label="t('prowlarr.common.delete')"
                  data-test="tag-delete"
                  @click="askDelete(tag.id, tag.label)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </ProwlarrPage>
</template>
