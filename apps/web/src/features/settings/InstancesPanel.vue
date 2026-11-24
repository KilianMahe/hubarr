<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Radarr ou Sonarr dans la section « Services externes » : instances
// (`admin/_instance_rows.html.twig`) en tableau sur grand écran, en liste sur
// mobile, avec défaut, activation, test, édition et suppression. Désactiver ou supprimer la dernière instance active demande
// confirmation (le service disparaît du menu).
import {
  SERVICE_SETTINGS,
  type InstanceListResponse,
  type InstanceTestResponse,
  type InstanceType,
  type ServiceInstance,
} from '@hubarr/shared';
import { msAdd } from '../../components/symbols';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useNotifyStore } from '../../app/stores/notify';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import InstanceDialog from './InstanceDialog.vue';
import InstanceRowActions from './InstanceRowActions.vue';
import { serviceSettingsEntry } from '../../app/service-admin';
import { instanceActions, storeInstances } from './settings-api';
import ServiceLogo from './ServiceLogo.vue';
import type { HealthState } from './service-status';

const props = defineProps<{
  type: InstanceType;
  instances: ServiceInstance[];
  sidebarVisible: boolean;
  /** État de santé par slug d'instance. */
  health: Record<string, HealthState>;
}>();
const emit = defineEmits<{ sidebar: [visible: boolean] }>();

const { t } = useI18n();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const { mdAndUp } = useDisplay();
const label = computed(() => SERVICE_SETTINGS[props.type].label);
const enabledCount = computed(() => props.instances.filter((row) => row.enabled).length);

const dialogOpen = ref(false);
const editing = ref<ServiceInstance | null>(null);
const results = ref<Record<number, InstanceTestResponse>>({});
// La confirmation ferme le dialogue avant d'émettre `confirm` : l'action reste
// donc rangée jusqu'à la prochaine demande.
const confirmOpen = ref(false);
const pending = ref<{ message: string; run: () => void }>({ message: '', run: () => undefined });
function ask(message: string, run: () => void): void {
  pending.value = { message, run };
  confirmOpen.value = true;
}

function received(list: InstanceListResponse, flash?: string): void {
  storeInstances(queryClient, list);
  if (flash !== undefined) notify.success(flash);
}

const action = useMutation({
  mutationFn: ({ run }: { run: () => Promise<InstanceListResponse>; flash: string }) => run(),
  onSuccess: (list, { flash }) => {
    received(list, flash);
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});

const test = useMutation({
  mutationFn: (row: ServiceInstance) => instanceActions.test(row.id),
  onSuccess: (result, row) => (results.value = { ...results.value, [row.id]: result }),
  onError: () => {
    notify.error('error.generic.message');
  },
});

function openDialog(row: ServiceInstance | null): void {
  editing.value = row;
  dialogOpen.value = true;
}

function setDefault(row: ServiceInstance): void {
  action.mutate({
    run: () => instanceActions.setDefault(row.id),
    flash: 'admin.instances.flash.default_set',
  });
}

function isLastEnabled(row: ServiceInstance): boolean {
  return row.enabled && enabledCount.value === 1;
}

function toggle(row: ServiceInstance): void {
  const run = () => {
    action.mutate({
      run: () => instanceActions.toggle(row.id),
      flash: row.enabled ? 'admin.instances.flash.disabled' : 'admin.instances.flash.enabled',
    });
  };
  if (isLastEnabled(row))
    ask(t('admin.instances.action.disable_last_confirm', { service: label.value }), run);
  else run();
}

function remove(row: ServiceInstance): void {
  const message = isLastEnabled(row)
    ? t('admin.instances.action.delete_last_confirm', { name: row.name, service: label.value })
    : t('admin.instances.action.delete_confirm', { name: row.name });
  ask(message, () => {
    action.mutate({
      run: () => instanceActions.remove(row.id),
      flash: 'admin.instances.flash.deleted',
    });
  });
}

function dotColor(row: ServiceInstance): string {
  if (!row.enabled) return 'muted';
  const state = props.health[row.slug];
  if (state === 'up') return 'success';
  if (state === 'down') return 'error';
  return 'muted';
}
</script>

<template>
  <v-expansion-panel :value="type" :data-service-card="type" elevation="0">
    <v-expansion-panel-title>
      <div class="d-flex align-center ga-3 flex-grow-1 min-w-0">
        <ServiceLogo :service="type" />
        <div class="min-w-0 flex-grow-1">
          <div class="text-title-medium">{{ label }}</div>
          <div class="text-body-small text-muted text-truncate">
            {{
              instances.length > 0
                ? t('admin.services.instances_count', { count: instances.length })
                : t(`admin.services.subtitle.${type}`)
            }}
          </div>
        </div>
        <v-chip
          v-if="instances.length === 0"
          color="muted"
          size="small"
          variant="tonal"
          label
          class="me-2"
        >
          {{ t('admin.services.state.new') }}
        </v-chip>
      </div>
    </v-expansion-panel-title>

    <v-expansion-panel-text>
      <!-- Grand écran : tableau des instances (maquette P0 « Réglages », P5b.1 R1) -->
      <v-table v-if="instances.length > 0 && mdAndUp" density="compact" class="bg-transparent">
        <thead>
          <tr>
            <th>{{ t('admin.instances.col.name') }}</th>
            <th>{{ t('admin.instances.col.url') }}</th>
            <th>{{ t('admin.instances.col.test') }}</th>
            <th>{{ t('admin.instances.col.enabled') }}</th>
            <th class="text-end">{{ t('admin.instances.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in instances" :key="row.id" :data-instance-row="row.id">
            <td>
              <div class="d-flex align-center ga-2">
                <v-badge dot inline :color="dotColor(row)" />
                <span>{{ row.name }}</span>
                <v-chip v-if="row.isDefault" size="x-small" color="primary" variant="tonal" label>
                  {{ t('admin.instances.badge.default') }}
                </v-chip>
              </div>
            </td>
            <td class="text-body-small text-muted text-truncate" style="max-width: 280px">
              {{ row.url }}
            </td>
            <td class="text-body-small">
              <span
                v-if="results[row.id]"
                :class="results[row.id]?.ok ? 'text-success' : 'text-error'"
                >{{
                  t(`admin.test.category.${results[row.id]?.category}`, {
                    http: results[row.id]?.http ?? '',
                  })
                }}</span
              >
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              <v-switch
                :model-value="row.enabled"
                color="primary"
                density="compact"
                hide-details
                :aria-label="t('admin.instances.col.enabled')"
                data-test="instance-enabled"
                @click.prevent="toggle(row)"
              />
            </td>
            <td>
              <InstanceRowActions
                :row="row"
                :testing="test.isPending.value && test.variables.value?.id === row.id"
                :settings-to="row.enabled ? serviceSettingsEntry(type, row.slug) : undefined"
                @test="test.mutate(row)"
                @set-default="setDefault(row)"
                @edit="openDialog(row)"
                @remove="remove(row)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
      <v-list v-else-if="instances.length > 0" density="comfortable" class="bg-transparent py-0">
        <v-list-item
          v-for="row in instances"
          :key="row.id"
          :class="{ 'opacity-60': !row.enabled }"
          :data-instance-row="row.id"
          class="px-0"
        >
          <template #prepend>
            <v-badge dot inline :color="dotColor(row)" class="me-3" />
          </template>
          <v-list-item-title class="d-flex align-center ga-2">
            <span>{{ row.name }}</span>
            <v-chip v-if="row.isDefault" size="x-small" color="primary" variant="tonal" label>
              {{ t('admin.instances.badge.default') }}
            </v-chip>
            <v-chip v-if="!row.enabled" size="x-small" variant="tonal" label>
              {{ t('admin.services.state.disabled') }}
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle class="text-truncate">{{ row.url }}</v-list-item-subtitle>
          <div
            v-if="results[row.id]"
            class="text-body-small mt-1"
            :class="results[row.id]?.ok ? 'text-success' : 'text-error'"
          >
            {{
              t(`admin.test.category.${results[row.id]?.category}`, {
                http: results[row.id]?.http ?? '',
              })
            }}
          </div>

          <template #append>
            <InstanceRowActions
              :row="row"
              :testing="test.isPending.value && test.variables.value?.id === row.id"
              :settings-to="row.enabled ? serviceSettingsEntry(type, row.slug) : undefined"
              show-toggle
              @test="test.mutate(row)"
              @set-default="setDefault(row)"
              @toggle="toggle(row)"
              @edit="openDialog(row)"
              @remove="remove(row)"
            />
          </template>
        </v-list-item>
      </v-list>
      <p v-else class="text-body-medium text-muted mb-2">
        {{ t('admin.instances.empty.subtitle', { service: label }) }}
      </p>

      <div class="d-flex flex-wrap align-center ga-2 mt-2">
        <v-btn
          :prepend-icon="msAdd"
          variant="tonal"
          data-test="instance-add"
          @click="openDialog(null)"
        >
          {{ t('admin.instances.add', { service: label }).replace(/^\+\s*/, '') }}
        </v-btn>
        <v-spacer />
        <v-switch
          :model-value="sidebarVisible"
          :label="t('admin.services.sidebar_toggle')"
          :title="t('admin.services.sidebar_toggle_title')"
          color="primary"
          hide-details
          density="compact"
          @update:model-value="(value) => emit('sidebar', value === true)"
        />
      </div>
    </v-expansion-panel-text>

    <InstanceDialog
      v-model="dialogOpen"
      :type="type"
      :instance="editing"
      @saved="
        (list) =>
          received(
            list,
            editing === null ? 'admin.instances.flash.created' : 'admin.instances.flash.updated',
          )
      "
    />
    <ConfirmDialog
      v-model="confirmOpen"
      :message="pending.message"
      danger
      @confirm="pending.run()"
    />
  </v-expansion-panel>
</template>
