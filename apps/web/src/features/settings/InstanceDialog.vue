<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout ou modification d'une instance Radarr/Sonarr (`admin/_instance_modals`).
// Le profil de qualité par défaut est proposé depuis l'instance elle-même
// (liste chargée à l'ouverture ; à défaut, la valeur enregistrée reste choisie).
import {
  SERVICE_SETTINGS,
  type InstanceListResponse,
  type InstanceType,
  type ServiceInstance,
} from '@hubarr/shared';
import { msWarningFill } from '../../components/symbols';
import { useMutation } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';
import { z } from 'zod';
import { ApiError, api } from '../../app/api/client';
import DialogTitle from '../../components/DialogTitle.vue';
import PasswordField from '../../components/PasswordField.vue';
import { instanceActions } from './settings-api';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ type: InstanceType; instance: ServiceInstance | null }>();
const emit = defineEmits<{ saved: [list: InstanceListResponse] }>();

const { t } = useI18n();
const { smAndDown } = useDisplay();
const label = computed(() => SERVICE_SETTINGS[props.type].label);
const form = reactive({
  name: '',
  url: '',
  apiKey: '',
  slug: '',
  enabled: true,
  qualityProfile: '',
});
const errors = ref<{ key: string; reason: string }[]>([]);

/** Problèmes de validation (clé i18n et raison d'un refus d'URL). */
function problemsOf(error: unknown): { key: string; reason: string }[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return [{ key: 'error.generic.message', reason: '' }];
  }
  return (error.details as { message?: unknown; reason?: unknown }[]).map((issue) => ({
    key: typeof issue.message === 'string' ? issue.message : 'error.generic.message',
    reason: typeof issue.reason === 'string' ? issue.reason : '',
  }));
}
const profiles = ref<{ id: number; name: string }[]>([]);

const profileListSchema = z.array(z.object({ id: z.number().int(), name: z.string() }).loose());

async function loadProfiles(instance: ServiceInstance): Promise<void> {
  const path =
    props.type === 'radarr'
      ? `/api/medias/${encodeURIComponent(instance.slug)}/films/quality-profiles`
      : `/api/medias/${encodeURIComponent(instance.slug)}/sonarr/quality-profiles`;
  try {
    profiles.value = (await api.get(path, profileListSchema)).map(({ id, name }) => ({ id, name }));
  } catch {
    profiles.value = [];
  }
}

watch(open, (visible) => {
  if (!visible) return;
  errors.value = [];
  const current = props.instance;
  Object.assign(form, {
    name: current?.name ?? '',
    url: current?.url ?? '',
    apiKey: '',
    slug: current?.slug ?? '',
    enabled: current?.enabled ?? true,
    qualityProfile: current?.defaultQualityProfileId?.toString() ?? '',
  });
  profiles.value = [];
  if (current !== null) void loadProfiles(current);
});

const profileItems = computed(() => {
  const items = [{ value: '', title: t('admin.instances.field.default_quality_profile_none') }];
  const known = profiles.value.map((profile) => ({
    value: String(profile.id),
    title: profile.name,
  }));
  if (form.qualityProfile !== '' && !known.some((item) => item.value === form.qualityProfile)) {
    known.unshift({ value: form.qualityProfile, title: `#${form.qualityProfile}` });
  }
  return [...items, ...known];
});

const submit = useMutation({
  mutationFn: () => {
    const base = {
      name: form.name,
      url: form.url,
      apiKey: form.apiKey,
      slug: form.slug,
      enabled: form.enabled,
    };
    return props.instance === null
      ? instanceActions.add(props.type, base)
      : instanceActions.edit(props.instance.id, {
          ...base,
          defaultQualityProfileId: form.qualityProfile === '' ? null : Number(form.qualityProfile),
        });
  },
  onMutate: () => (errors.value = []),
  onSuccess: (list) => {
    open.value = false;
    emit('saved', list);
  },
  onError: (error) => {
    errors.value = problemsOf(error);
  },
});
</script>

<template>
  <component :is="smAndDown ? VBottomSheet : VDialog" v-model="open" max-width="560" scrollable>
    <v-card :data-test="`instance-dialog-${type}`">
      <DialogTitle
        :title="
          instance === null
            ? t('admin.instances.modal.add_title', { service: label })
            : t('admin.instances.modal.edit_title', { name: instance.name })
        "
        @close="open = false"
      />
      <v-card-text>
        <form id="instance-form" autocomplete="off" @submit.prevent="submit.mutate()">
          <v-alert
            v-for="problem in errors"
            :key="problem.key"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-test="instance-error"
          >
            {{ t(problem.key, { reason: problem.reason }) }}
          </v-alert>
          <v-text-field
            v-model="form.name"
            :label="t('admin.instances.field.name')"
            :hint="t('admin.instances.field.name_hint')"
            persistent-hint
            maxlength="100"
            class="mb-2"
            autofocus
          />
          <v-text-field
            v-model="form.url"
            :label="t('admin.field.url')"
            :placeholder="SERVICE_SETTINGS[type].fields[0].placeholder"
            spellcheck="false"
          />
          <PasswordField
            v-model="form.apiKey"
            :label="t('admin.field.api_key')"
            :hint="instance?.hasApiKey ? t('admin.services.secret_saved') : undefined"
            persistent-hint
            autocomplete="off"
            class="mb-2"
          />
          <v-switch
            v-model="form.enabled"
            :label="t('admin.instances.col.enabled')"
            color="primary"
            hide-details
            density="compact"
          />
          <v-select
            v-if="instance !== null"
            v-model="form.qualityProfile"
            :items="profileItems"
            :label="t('admin.instances.field.default_quality_profile')"
            :hint="t('admin.instances.field.default_quality_profile_hint')"
            persistent-hint
            class="mt-2"
          />
          <v-expansion-panels variant="accordion" class="mt-4" flat>
            <v-expansion-panel :title="t('admin.instances.field.advanced')" elevation="0">
              <v-expansion-panel-text>
                <v-text-field
                  v-model="form.slug"
                  :label="t('admin.instances.field.slug')"
                  :placeholder="
                    instance === null ? t('admin.instances.field.slug_auto') : undefined
                  "
                  :hint="t('admin.instances.field.slug_hint')"
                  persistent-hint
                  maxlength="60"
                  spellcheck="false"
                />
                <div v-if="instance !== null" class="d-flex ga-2 mt-3 text-body-small text-error">
                  <v-icon :icon="msWarningFill" size="small" />
                  <span>{{ t('admin.instances.field.slug_warning') }}</span>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </form>
      </v-card-text>
      <v-card-actions class="px-6 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.action.cancel') }}</v-btn>
        <v-btn
          type="submit"
          form="instance-form"
          color="primary"
          variant="flat"
          :loading="submit.isPending.value"
        >
          {{
            instance === null
              ? t('admin.instances.action.add_submit')
              : t('admin.instances.action.save')
          }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </component>
</template>
