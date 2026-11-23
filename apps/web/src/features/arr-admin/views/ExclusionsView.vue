<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Exclusions d'import (`radarr/exclusions.html.twig`, `sonarr/exclusions`) :
// ajout (identifiant TMDB ou TVDB, titre, année pour un film), liste paginée
// par l'instance (50, page dans l'URL), cases et « tout cocher », suppression
// unitaire et groupée confirmées.
import { exclusionPageSchema, exclusionSchema } from '@hubarr/shared';
import { mdiDelete, mdiPlus } from '@mdi/js';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import { useRoutePage } from '../../movies/useRoutePage';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';

const { t } = useI18n();
const { page, setPage } = useRoutePage();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'exclusions',
  () => `/exclusions?page=${page.value}`,
  exclusionPageSchema,
);
const confirm = useConfirmAction();
const records = computed(() => query.data.value?.records ?? []);
const pages = computed(() => Math.max(1, Math.ceil((query.data.value?.totalRecords ?? 0) / 50)));
const isRadarr = computed(() => ctx.kind.value === 'radarr');

const selected = ref<number[]>([]);
watch(page, () => (selected.value = []));
const allSelected = computed(
  () => records.value.length > 0 && selected.value.length === records.value.length,
);
function toggleAll(value: boolean | null): void {
  selected.value = value ? records.value.map((record) => record.id) : [];
}

const form = reactive({ externalId: '', title: '', year: '' });
const adding = ref(false);
async function add(): Promise<void> {
  const externalId = Number.parseInt(form.externalId, 10);
  if (!Number.isFinite(externalId) || externalId <= 0) return;
  adding.value = true;
  const ok = await run(
    () =>
      ctx.post(
        '/exclusions/ajouter',
        { externalId, title: form.title.trim(), year: Number.parseInt(form.year, 10) || 0 },
        exclusionSchema,
      ),
    ctx.key('add_error'),
    t(ctx.key('added_ok')),
  );
  if (ok) Object.assign(form, { externalId: '', title: '', year: '' });
  adding.value = false;
}

function askDelete(id: number): void {
  confirm.ask(t(ctx.key('delete_confirm')), () =>
    run(async () => {
      await ctx.post(`/exclusions/${id}/supprimer`);
      selected.value = selected.value.filter((value) => value !== id);
    }, ctx.key('delete_error')),
  );
}

function askBulkDelete(): void {
  const ids = [...selected.value];
  confirm.ask(t(ctx.key('bulk_confirm_tpl'), { count: ids.length }), () =>
    run(async () => {
      await ctx.post('/exclusions/bulk-supprimer', { ids });
      selected.value = [];
    }, ctx.key('delete_error')),
  );
}
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="query.data.value?.totalRecords ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <template #actions>
      <v-btn
        v-if="selected.length > 0"
        color="error"
        variant="tonal"
        size="small"
        :prepend-icon="mdiDelete"
        data-test="exclusions-bulk-delete"
        @click="askBulkDelete"
        >{{ t(ctx.key('bulk_delete')) }} ({{ selected.length }})</v-btn
      >
    </template>
    <v-card variant="flat" border class="mb-4">
      <v-card-title class="text-title-medium">{{ t(ctx.key('add_card_title')) }}</v-card-title>
      <v-card-text>
        <form class="d-flex flex-wrap ga-2 align-center" @submit.prevent="add">
          <v-text-field
            v-model="form.externalId"
            :label="isRadarr ? t(ctx.key('tmdb_id')) : t(ctx.key('col_tvdb'))"
            :placeholder="t(ctx.key('tmdb_id_placeholder'))"
            type="number"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 160px"
            data-test="exclusion-id"
          />
          <v-text-field
            v-model="form.title"
            :label="isRadarr ? t(ctx.key('movie_title')) : t(ctx.key('col_title'))"
            :placeholder="t(ctx.key('movie_title_placeholder'))"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 220px"
            data-test="exclusion-title"
          />
          <v-text-field
            v-if="isRadarr"
            v-model="form.year"
            :label="t(ctx.key('year'))"
            type="number"
            min="1900"
            max="2099"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 120px"
          />
          <v-btn
            type="submit"
            color="service"
            :prepend-icon="mdiPlus"
            :loading="adding"
            :disabled="form.externalId === ''"
            data-test="exclusion-add"
            >{{ t(ctx.key('add_button')) }}</v-btn
          >
        </form>
      </v-card-text>
    </v-card>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th style="width: 40px">
              <v-checkbox-btn
                :model-value="allSelected"
                color="service"
                data-test="exclusions-check-all"
                @update:model-value="toggleAll"
              />
            </th>
            <th>{{ t(ctx.key('col_title')) }}</th>
            <th v-if="isRadarr">{{ t(ctx.key('col_year')) }}</th>
            <th>{{ t(ctx.key(isRadarr ? 'col_tmdb' : 'col_tvdb')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.id" data-test="exclusion-row">
            <td><v-checkbox-btn v-model="selected" :value="record.id" color="service" /></td>
            <td class="font-weight-medium">{{ record.title ?? '—' }}</td>
            <td v-if="isRadarr">{{ record.year ?? '—' }}</td>
            <td class="text-muted">{{ record.externalId ?? '—' }}</td>
            <td class="text-end">
              <v-btn
                :icon="mdiDelete"
                color="error"
                variant="text"
                size="small"
                :aria-label="t(ctx.key('btn_delete_title'))"
                :title="t(ctx.key('btn_delete_title'))"
                data-test="exclusion-delete"
                @click="askDelete(record.id)"
              />
            </td>
          </tr>
          <tr v-if="records.length === 0">
            <td colspan="5" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
      <div v-if="pages > 1" class="d-flex align-center justify-center pa-2">
        <span class="text-body-small text-muted me-2">{{
          t(ctx.key('page_label_tpl'), { page, total: pages })
        }}</span>
        <v-pagination
          :model-value="page"
          :length="pages"
          density="compact"
          total-visible="5"
          @update:model-value="setPage"
        />
      </div>
    </v-card>
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </AdminPage>
</template>
