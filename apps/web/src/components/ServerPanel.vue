<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Onglet « Serveur » d'un service (P5b.4, D131) : pastille, nom et version du
// service, puis ses pages d'administration et ses commandes en cartes de
// listes d'actions. Une commande peut demander confirmation.
import type { ServiceId } from '@hubarr/shared';
import { mdiChevronRight } from '@mdi/js';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from './ConfirmDialog.vue';
import ServiceLogo from '../features/settings/ServiceLogo.vue';
import type { ServerGroup, ServerItem } from './server-panel';

defineProps<{
  service: ServiceId;
  title: string;
  version?: string | null;
  groups: ServerGroup[];
}>();
const { t } = useI18n();
const busy = reactive<Record<string, boolean>>({});
const pending = ref<ServerItem | null>(null);
const confirmOpen = ref(false);

async function execute(item: ServerItem): Promise<void> {
  if (!item.run || busy[item.id]) return;
  busy[item.id] = true;
  try {
    await item.run();
  } finally {
    busy[item.id] = false;
  }
}
function onClick(item: ServerItem): void {
  if (!item.run) return;
  if (item.confirm) {
    pending.value = item;
    confirmOpen.value = true;
    return;
  }
  void execute(item);
}
function onConfirm(): void {
  if (pending.value) void execute(pending.value);
}
</script>

<template>
  <section class="server-panel" data-test="server-panel">
    <div class="server-panel__head">
      <ServiceLogo :service="service" :size="56" />
      <h2 class="text-headline-small mt-3">{{ title }}</h2>
      <p v-if="version" class="text-body-medium text-muted" data-test="server-version">
        {{ t('server.version', { version }) }}
      </p>
    </div>
    <v-card
      v-for="(group, index) in groups"
      :key="index"
      variant="flat"
      border
      class="server-panel__group"
    >
      <v-list density="comfortable" bg-color="transparent">
        <v-list-subheader v-if="group.title">{{ group.title }}</v-list-subheader>
        <v-list-item
          v-for="item in group.items"
          :key="item.id"
          :to="item.to"
          :title="item.label"
          :disabled="busy[item.id] === true"
          :data-test="`server-item-${item.id}`"
          @click="onClick(item)"
        >
          <template #prepend>
            <v-icon :icon="item.icon" color="service-text" />
          </template>
          <template #append>
            <v-progress-circular
              v-if="busy[item.id]"
              indeterminate
              size="18"
              width="2"
              color="service"
            />
            <v-icon v-else :icon="mdiChevronRight" size="20" class="text-muted" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
    <ConfirmDialog v-model="confirmOpen" :message="pending?.confirm ?? ''" @confirm="onConfirm" />
  </section>
</template>

<style scoped>
.server-panel {
  max-width: 720px;
  margin: 0 auto;
}
.server-panel__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 8px 0 20px;
  text-align: center;
}
.server-panel__head h2 {
  margin: 0;
}
.server-panel__group + .server-panel__group {
  margin-top: 12px;
}
</style>
