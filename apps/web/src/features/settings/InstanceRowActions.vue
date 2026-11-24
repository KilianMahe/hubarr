<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Actions d'une instance Radarr/Sonarr (liste mobile et tableau desktop) :
// paramètres de l'instance (page à onglets, P5d.3, D149), test de connexion,
// puis menu défaut, activation, édition, suppression.
import type { ServiceInstance } from '@hubarr/shared';
import { msBolt, msDelete, msEdit, msMoreVert, msSettings } from '../../components/symbols';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';

defineProps<{
  row: ServiceInstance;
  testing: boolean;
  showToggle?: boolean;
  /** Page de paramètres de l'instance (instance activée seulement). */
  settingsTo?: RouteLocationRaw | undefined;
}>();
const emit = defineEmits<{
  test: [];
  setDefault: [];
  toggle: [];
  edit: [];
  remove: [];
}>();
const { t } = useI18n();
</script>

<template>
  <div class="d-flex align-center justify-end">
    <v-btn
      v-if="settingsTo"
      :to="settingsTo"
      :icon="msSettings"
      :aria-label="t('admin.service_admin.open_instance', { name: row.name })"
      :title="t('admin.service_admin.open_instance', { name: row.name })"
      variant="text"
      size="small"
      :data-test="`instance-settings-${row.slug}`"
    />
    <v-btn
      :icon="msBolt"
      :aria-label="t('admin.services.test')"
      :title="t('admin.services.test')"
      :loading="testing"
      variant="text"
      size="small"
      data-test="instance-test"
      @click="emit('test')"
    />
    <v-menu>
      <template #activator="{ props: menu }">
        <v-btn
          v-bind="menu"
          :icon="msMoreVert"
          :aria-label="t('admin.instances.col.actions')"
          variant="text"
          size="small"
        />
      </template>
      <v-list density="compact">
        <v-list-item
          v-if="!row.isDefault"
          :title="t('admin.instances.action.set_default')"
          @click="emit('setDefault')"
        />
        <v-list-item
          v-if="showToggle"
          :title="t('admin.instances.col.enabled')"
          @click="emit('toggle')"
        >
          <template #append>
            <v-switch
              :model-value="row.enabled"
              color="primary"
              density="compact"
              hide-details
              readonly
            />
          </template>
        </v-list-item>
        <v-list-item
          :prepend-icon="msEdit"
          :title="t('admin.instances.action.edit')"
          @click="emit('edit')"
        />
        <v-list-item
          :prepend-icon="msDelete"
          :title="t('admin.instances.action.delete')"
          base-color="error"
          @click="emit('remove')"
        />
      </v-list>
    </v-menu>
  </div>
</template>
