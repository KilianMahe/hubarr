<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Renommage en masse (`modal-bulk-rename`, `modal-bulk-rename-series`) :
// prévisualisation des renommages de chaque élément sélectionné (ancien →
// nouveau nom), nombre d'éléments déjà bien nommés, puis « Organiser n
// fichier(s) » lance le renommage élément par élément (4 à la fois). Partagé par
// les films (`RenameMovie`) et les séries (`RenameSeries`).
import { msCheck, msClose } from './symbols';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fileName, mapLimit } from '../features/movies/library';
import ResponsiveDialog from './ResponsiveDialog.vue';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  items: { id: number; title: string }[];
  /** Renommages proposés pour un élément. */
  preview: (id: number) => Promise<{ existingPath: string | null; newPath: string | null }[]>;
  /** Lance le renommage d'un élément. */
  run: (id: number) => Promise<unknown>;
  /** Clés i18n : titre, chargement, déjà corrects (`{count}`), tout correct, organiser (`{count}`), annuler. */
  keys: {
    title: string;
    loading: string;
    correct: string;
    allCorrect: string;
    organise: string;
    cancel: string;
  };
}>();
const emit = defineEmits<{ done: [count: number]; failed: [] }>();
const { t } = useI18n();

interface Change {
  itemId: number;
  title: string;
  from: string;
  to: string;
}
const loading = ref(false);
const changes = ref<Change[]>([]);
const correct = ref(0);
const running = ref(false);

watch(open, async (value) => {
  if (!value) return;
  loading.value = true;
  changes.value = [];
  correct.value = 0;
  const results = await mapLimit(props.items, 4, async (item) => {
    try {
      return { item, proposals: await props.preview(item.id) };
    } catch {
      return { item, proposals: null };
    }
  });
  if (!open.value) return;
  for (const { item, proposals } of results) {
    if (proposals === null) continue;
    if (proposals.length === 0) correct.value += 1;
    for (const proposal of proposals) {
      changes.value.push({
        itemId: item.id,
        title: item.title,
        from: fileName(proposal.existingPath),
        to: fileName(proposal.newPath),
      });
    }
  }
  loading.value = false;
});

const itemIds = computed(() => [...new Set(changes.value.map((change) => change.itemId))]);

async function organise(): Promise<void> {
  running.value = true;
  try {
    const ids = itemIds.value;
    await mapLimit(ids, 4, (id) => props.run(id).catch(() => null));
    open.value = false;
    emit('done', ids.length);
  } catch {
    emit('failed');
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <ResponsiveDialog v-model="open" :title="t(keys.title)" :max-width="640">
    <div v-if="loading" class="d-flex align-center ga-2 text-body-medium text-muted py-4">
      <v-progress-circular indeterminate size="18" width="2" />
      {{ t(keys.loading) }}
    </div>
    <template v-else>
      <v-alert v-if="correct > 0" type="success" variant="tonal" density="compact" class="mb-3">{{
        t(keys.correct, { count: correct })
      }}</v-alert>
      <div class="bulk-rename__list" data-test="bulk-rename-changes">
        <div v-for="(change, index) in changes" :key="index" class="bulk-rename__item">
          <div class="text-body-medium font-weight-medium mb-1">{{ change.title }}</div>
          <div class="text-body-small text-error bulk-rename__name">
            <v-icon :icon="msClose" size="12" /> {{ change.from }}
          </div>
          <div class="text-body-small text-success bulk-rename__name">
            <v-icon :icon="msCheck" size="12" /> {{ change.to }}
          </div>
        </div>
      </div>
    </template>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t(keys.cancel) }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        :disabled="loading || changes.length === 0"
        :loading="running"
        data-test="bulk-rename-go"
        @click="organise"
        >{{
          !loading && changes.length === 0
            ? t(keys.allCorrect)
            : t(keys.organise, { count: changes.length })
        }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.bulk-rename__list {
  max-height: 350px;
  overflow-y: auto;
}
.bulk-rename__item {
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.bulk-rename__name {
  overflow-wrap: anywhere;
}
</style>
