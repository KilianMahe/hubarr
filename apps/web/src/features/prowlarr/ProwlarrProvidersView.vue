<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Page d'une famille à schéma de Prowlarr (applications, clients,
// notifications ; `prowlarr/_schema_page` et pages dérivées) : cartes
// (implémentation, champs résumés, priorité et état, déclencheurs, niveau de
// synchronisation), ajout, modification, test, suppression confirmée.
import {
  providerListSchema,
  providerSchema,
  providerTestResponseSchema,
  type Provider,
} from '@hubarr/shared';
import { mdiCheck, mdiClose, mdiDelete, mdiFlask, mdiPencil, mdiPlus } from '@mdi/js';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../app/api/client';
import { apiErrorText } from '../../app/api/error-text';
import { fillLegacy } from '../../app/legacy-template';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import { useConfirmAction } from '../arr-admin/admin-api';
import ProwlarrPage from './ProwlarrPage.vue';
import ProwlarrProviderDialog from './ProwlarrProviderDialog.vue';
import { PROWLARR_API, useProwlarrPage } from './prowlarr-api';
import {
  PROWLARR_PROVIDER_FAMILIES,
  initialProviderForm,
  providerSavePayload,
  summaryFields,
  type ProwlarrProviderFamilyId,
} from './providers';
import EmptyState from '../../components/EmptyState.vue';

const props = defineProps<{ family: ProwlarrProviderFamilyId }>();
const spec = computed(() => PROWLARR_PROVIDER_FAMILIES[props.family]);
const { t } = useI18n();
const { query, feedback, error, run } = useProwlarrPage(
  PROWLARR_PROVIDER_FAMILIES[props.family].list,
  providerListSchema,
);
const confirm = useConfirmAction();
const items = computed(() => query.data.value ?? []);
const url = (suffix: string) => `${PROWLARR_API}/${spec.value.segment}${suffix}`;

const dialog = reactive<{ open: boolean; id: number | null }>({ open: false, id: null });
function edit(id: number | null): void {
  dialog.id = id;
  dialog.open = true;
}

const tests = reactive(new Map<number, 'pending' | 'ok' | 'failed'>());
async function test(item: Provider): Promise<void> {
  if (item.id === undefined) return;
  const id = item.id;
  tests.set(id, 'pending');
  try {
    const raw = await api.get(url(`/${id}`), providerSchema);
    const result = await api.post(
      url('/test'),
      providerSavePayload(raw, initialProviderForm(spec.value, raw)),
      providerTestResponseSchema,
    );
    tests.set(id, result.ok ? 'ok' : 'failed');
    feedback.value = result.ok
      ? { type: 'success', text: `${item.name ?? ''} — ${t('prowlarr.common.test_success')}` }
      : {
          type: 'error',
          text: `${item.name ?? ''} — ${fillLegacy(t('prowlarr.common.test_failure_tpl'), {
            ERROR: result.message ?? '—',
          })}`,
        };
  } catch (failure) {
    tests.set(id, 'failed');
    feedback.value = { type: 'error', text: apiErrorText(failure, t, 'prowlarr.common.error') };
  }
  setTimeout(() => tests.delete(id), 3_000);
}

function askDelete(item: Provider): void {
  if (item.id === undefined) return;
  const id = item.id;
  confirm.ask(fillLegacy(t('prowlarr.common.confirm_delete_tpl'), { NAME: item.name ?? '' }), () =>
    run(() => api.post(url(`/${id}/delete`), {}), 'prowlarr.common.error'),
  );
}

async function onSaved(): Promise<void> {
  feedback.value = { type: 'success', text: t('prowlarr.common.saved') };
  await query.refetch();
}

const testIcon = (id: number | undefined) =>
  id === undefined
    ? mdiFlask
    : tests.get(id) === 'ok'
      ? mdiCheck
      : tests.get(id) === 'failed'
        ? mdiClose
        : mdiFlask;
const syncLabel = (level: unknown) =>
  level === 'disabled'
    ? t('prowlarr.apps.sync_disabled')
    : level === 'addOnly'
      ? t('prowlarr.apps.sync_add_only')
      : level === 'fullSync'
        ? t('prowlarr.apps.sync_full')
        : '—';
const TRIGGER_BADGES = [
  ['onGrab', 'prowlarr.notifications.trigger_grab'],
  ['onHealthIssue', 'prowlarr.notifications.badge_health'],
  ['onHealthRestored', 'prowlarr.notifications.badge_health_restored'],
  ['onApplicationUpdate', 'prowlarr.notifications.badge_app_update'],
  ['includeHealthWarnings', 'prowlarr.notifications.badge_warnings'],
] as const;
</script>

<template>
  <ProwlarrPage
    v-model:feedback="feedback"
    :title="t(`${spec.prefix}.title`)"
    :count="query.data.value?.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <template #actions>
      <v-btn
        color="service"
        size="small"
        :prepend-icon="mdiPlus"
        data-test="provider-add"
        @click="edit(null)"
        >{{ t(`${spec.prefix}.add_btn`) }}</v-btn
      >
    </template>
    <EmptyState
      v-if="items.length === 0"
      inline
      :title="
        family === 'notifications'
          ? t('prowlarr.notifications.empty')
          : t('prowlarr.common.no_items')
      "
      data-test="provider-empty"
    />
    <div v-else class="prowlarr-providers mb-4">
      <v-card
        v-for="(item, index) in items"
        :key="item.id ?? `new-${index}`"
        variant="flat"
        border
        data-test="provider-card"
      >
        <v-card-text>
          <div class="d-flex align-center ga-2 mb-2">
            <div class="flex-grow-1 min-w-0">
              <div class="font-weight-medium text-truncate">{{ item.name ?? '—' }}</div>
              <div class="text-body-small text-muted">{{ item.implementationName ?? '' }}</div>
            </div>
            <v-chip
              v-if="spec.showProtocol"
              size="x-small"
              label
              variant="tonal"
              :color="item.protocol === 'usenet' ? 'info' : 'primary'"
              >{{ item.protocol === 'usenet' ? 'Usenet' : 'Torrent' }}</v-chip
            >
          </div>
          <dl class="prowlarr-providers__fields mb-2">
            <template v-for="field in summaryFields(item)" :key="field.label">
              <dt class="text-muted">{{ field.label }}</dt>
              <dd class="text-truncate">{{ field.value }}</dd>
            </template>
            <template v-if="family === 'applications'">
              <dt class="text-muted">{{ t('prowlarr.apps.info_synclevel') }}</dt>
              <dd>{{ syncLabel(item.syncLevel) }}</dd>
            </template>
          </dl>
          <div class="d-flex flex-wrap ga-1">
            <template v-if="family === 'downloadClients'">
              <v-chip size="x-small" variant="tonal">{{
                fillLegacy(t('prowlarr.download_clients.priority_label_tpl'), {
                  VALUE: typeof item.priority === 'number' ? item.priority : 0,
                })
              }}</v-chip>
              <v-chip
                size="x-small"
                variant="tonal"
                :color="item.enable === true ? 'success' : undefined"
                >{{
                  t(item.enable === true ? 'prowlarr.common.active' : 'prowlarr.common.disabled')
                }}</v-chip
              >
            </template>
            <template v-if="family === 'notifications'">
              <template v-for="[key, label] in TRIGGER_BADGES" :key="key">
                <v-chip v-if="item[key] === true" size="x-small" variant="tonal">{{
                  t(label)
                }}</v-chip>
              </template>
            </template>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-btn
            :icon="mdiPencil"
            size="small"
            variant="text"
            :aria-label="t('prowlarr.common.edit')"
            data-test="provider-edit"
            @click="edit(item.id ?? null)"
          />
          <v-btn
            :icon="testIcon(item.id)"
            size="small"
            variant="text"
            :loading="item.id !== undefined && tests.get(item.id) === 'pending'"
            :aria-label="t('prowlarr.common.test')"
            data-test="provider-row-test"
            @click="test(item)"
          />
          <v-spacer />
          <v-btn
            :icon="mdiDelete"
            size="small"
            variant="text"
            color="error"
            :aria-label="t('prowlarr.common.delete')"
            data-test="provider-delete"
            @click="askDelete(item)"
          />
        </v-card-actions>
      </v-card>
    </div>
    <slot />
    <ProwlarrProviderDialog
      v-model="dialog.open"
      :family="spec"
      :item-id="dialog.id"
      @saved="onSaved"
    />
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </ProwlarrPage>
</template>

<style scoped>
.prowlarr-providers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.prowlarr-providers__fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  font-size: 0.875rem;
}
</style>
