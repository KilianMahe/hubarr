<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Un service à configuration unique dans la section « Services externes »
// (`admin/_services_list.html.twig`) : champs, « Tester », « Retirer »,
// interrupteurs « Activé » et « Menu ». Les secrets ne sont jamais préremplis :
// un champ vide les conserve.
import {
  SERVICE_SETTINGS,
  type FlatServiceId,
  type FlatServiceState,
  type ServicePatch,
  type ServiceTestResponse,
  type SettingsResponse,
} from '@hubarr/shared';
import { msBolt, msDelete, msSettings } from '../../components/symbols';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotifyStore } from '../../app/stores/notify';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import PasswordField from '../../components/PasswordField.vue';
import { SETTINGS_KEY, saveSettings, testService } from './settings-api';
import ServiceLogo from './ServiceLogo.vue';
import ServiceStatusChip from './ServiceStatusChip.vue';
import { isAdministered, serviceSettingsEntry } from '../../app/service-admin';
import type { HealthState } from './service-status';

const props = defineProps<{
  id: FlatServiceId;
  state: FlatServiceState;
  sidebarVisible: boolean;
  health: HealthState;
}>();

const { t } = useI18n();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const spec = computed(() => SERVICE_SETTINGS[props.id]);
const administered = computed(() => (isAdministered(props.id) ? props.id : null));

const form = reactive({ url: '', apiKey: '', user: '', password: '' });
const cleared = ref(new Set<'user' | 'password'>());
const result = ref<ServiceTestResponse | null>(null);
const confirmRemove = ref(false);

function reset(state: FlatServiceState): void {
  Object.assign(form, { url: state.url, user: state.user, apiKey: '', password: '' });
  cleared.value = new Set();
}
watch(() => props.state, reset, { immediate: true });

function received(next: SettingsResponse): void {
  queryClient.setQueryData(SETTINGS_KEY, next);
}

function patch(): ServicePatch {
  const out: ServicePatch = {};
  for (const field of spec.value.fields) out[field.key] = form[field.key];
  if (cleared.value.size > 0) out.clear = [...cleared.value];
  return out;
}

const save = useMutation({
  mutationFn: (body: Parameters<typeof saveSettings>[0]) => saveSettings(body),
  onSuccess: (next) => {
    received(next);
    notify.success('admin.flash.saved');
  },
  onError: () => {
    notify.error('error.generic.message');
  },
});

const test = useMutation({
  mutationFn: () => testService(props.id, { ...form }),
  onMutate: () => (result.value = null),
  onSuccess: (next) => (result.value = next),
  onError: () => {
    notify.error('error.generic.message');
  },
});

function clearField(key: 'user' | 'password'): void {
  form[key] = '';
  cleared.value = new Set([...cleared.value, key]);
}

function isCleared(key: string): boolean {
  return (cleared.value as Set<string>).has(key);
}

const secretHint = (key: string) =>
  (key === 'apiKey' && props.state.hasApiKey) ||
  (key === 'password' && props.state.hasPassword && !isCleared(key))
    ? t('admin.services.secret_saved')
    : undefined;

const subtitle = computed(() =>
  props.state.saved && props.state.url !== ''
    ? props.state.url
    : t(`admin.services.subtitle.${subtitleKey(props.id)}`),
);

/** Clés de sous-titre de l'original (`jellyseerr` pour Seerr). */
function subtitleKey(id: FlatServiceId): string {
  return id === 'seerr' ? 'jellyseerr' : id;
}

const resultColor = computed(() => (result.value?.ok ? 'success' : 'error'));
</script>

<template>
  <v-expansion-panel :value="id" :data-service-card="id" elevation="0">
    <v-expansion-panel-title>
      <div class="d-flex align-center ga-3 flex-grow-1 min-w-0">
        <ServiceLogo :service="id" />
        <div class="min-w-0 flex-grow-1">
          <div class="text-title-medium">{{ spec.label }}</div>
          <div class="text-body-small text-muted text-truncate">{{ subtitle }}</div>
        </div>
        <ServiceStatusChip
          :saved="state.saved"
          :disabled="spec.toggleable && !state.enabled"
          :probe="spec.testable"
          :health="health"
        />
      </div>
    </v-expansion-panel-title>

    <v-expansion-panel-text>
      <form
        class="d-flex flex-column ga-1"
        autocomplete="off"
        @submit.prevent="save.mutate({ services: { [id]: patch() } })"
      >
        <div v-for="field in spec.fields" :key="field.key" class="d-flex align-start ga-2">
          <PasswordField
            v-if="field.key === 'apiKey' || field.key === 'password'"
            v-model="form[field.key]"
            :label="t(field.labelKey)"
            :placeholder="'placeholder' in field ? field.placeholder : undefined"
            :hint="secretHint(field.key)"
            persistent-hint
            autocomplete="off"
            :name="`${id}-${field.key}`"
            class="flex-grow-1"
          />
          <v-text-field
            v-else
            v-model="form[field.key]"
            :label="t(field.labelKey)"
            :placeholder="'placeholder' in field ? field.placeholder : undefined"
            autocomplete="off"
            spellcheck="false"
            :name="`${id}-${field.key}`"
            class="flex-grow-1"
          />
          <v-btn
            v-if="
              'clearable' in field &&
              field.clearable &&
              (field.key === 'user' || field.key === 'password')
            "
            :prepend-icon="msDelete"
            variant="text"
            class="mt-2"
            :disabled="isCleared(field.key)"
            @click="clearField(field.key)"
            >{{ t('admin.field.clear') }}</v-btn
          >
        </div>

        <v-alert
          v-if="result"
          :type="resultColor"
          variant="tonal"
          density="compact"
          class="mb-2"
          data-test="test-result"
          >{{ t(`admin.test.category.${result.category}`, { http: result.http ?? '' }) }}</v-alert
        >

        <div class="d-flex flex-wrap align-center ga-2">
          <v-btn
            v-if="spec.testable"
            :prepend-icon="msBolt"
            variant="tonal"
            :loading="test.isPending.value"
            data-test="service-test"
            @click="test.mutate()"
            >{{ t('admin.services.test') }}</v-btn
          >
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            :loading="save.isPending.value"
            data-test="service-save"
            >{{ t('common.action.save') }}</v-btn
          >
          <!-- Paramètres du service, page à onglets (P5d.3, V24, D149) -->
          <v-btn
            v-if="administered && state.saved"
            :to="serviceSettingsEntry(administered)"
            :prepend-icon="msSettings"
            :title="t('admin.service_admin.hint', { service: spec.label })"
            variant="tonal"
            :data-test="`service-settings-${id}`"
            >{{ t('admin.service_admin.open') }}</v-btn
          >
          <v-spacer />
          <v-btn
            v-if="state.saved"
            :prepend-icon="msDelete"
            color="error"
            variant="text"
            data-test="service-remove"
            @click="confirmRemove = true"
            >{{ t('admin.services.remove') }}</v-btn
          >
        </div>

        <div class="d-flex flex-wrap ga-4">
          <v-switch
            v-if="spec.toggleable"
            :model-value="state.enabled"
            :label="t('admin.services.enabled')"
            :title="t('admin.services.enabled_title')"
            color="primary"
            hide-details
            density="compact"
            data-test="service-enabled"
            @update:model-value="
              (value) => save.mutate({ services: { [id]: { enabled: value === true } } })
            "
          />
          <v-switch
            :model-value="sidebarVisible"
            :label="t('admin.services.sidebar_toggle')"
            :title="t('admin.services.sidebar_toggle_title')"
            color="primary"
            hide-details
            density="compact"
            @update:model-value="(value) => save.mutate({ sidebar: { [id]: value === true } })"
          />
        </div>
      </form>
    </v-expansion-panel-text>

    <ConfirmDialog
      v-model="confirmRemove"
      :message="t('admin.services.remove_confirm', { service: spec.label })"
      :confirm-label="t('admin.services.remove')"
      danger
      @confirm="save.mutate({ services: { [id]: { remove: true } } })"
    />
  </v-expansion-panel>
</template>
