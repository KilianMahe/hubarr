<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Préchauffage de l'index Bazarr (`bazarr/_warming.html.twig`) : relances
// automatiques bornées (3, 5 puis 8 s), puis bouton « Réessayer » qui force
// une reconstruction en ligne (route n° 28) avant de relire la page.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { WARMING_SCHEDULE } from './grid';
import { bazarrApi } from './bazarr-api';

const emit = defineEmits<{ reload: [] }>();
const { t } = useI18n();
const attempts = ref(0);
const retrying = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

function arm(): void {
  const delay = WARMING_SCHEDULE[attempts.value];
  if (delay === undefined) return;
  timer = setTimeout(() => {
    attempts.value += 1;
    emit('reload');
    arm();
  }, delay);
}

async function retry(): Promise<void> {
  retrying.value = true;
  try {
    await bazarrApi.refresh();
  } catch {
    // Le bilan importe peu : la page relue dira si l'index est prêt.
  } finally {
    retrying.value = false;
    emit('reload');
  }
}

onMounted(arm);
onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer);
});
</script>

<template>
  <div class="text-center py-10" data-test="bazarr-warming">
    <v-progress-circular indeterminate color="service" class="mb-4" />
    <p class="text-title-medium">{{ t('bazarr.warming.title') }}</p>
    <p class="text-body-medium text-muted mb-4">{{ t('bazarr.warming.subtitle') }}</p>
    <v-btn
      v-if="attempts >= WARMING_SCHEDULE.length"
      color="service"
      :loading="retrying"
      data-test="bazarr-warming-retry"
      @click="retry"
      >{{ t('bazarr.warming.retry') }}</v-btn
    >
  </div>
</template>
