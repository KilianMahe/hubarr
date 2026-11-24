<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Champ « Chemin » des éditions de film et de série : explorateur des dossiers
// du serveur Radarr/Sonarr (sous-dossiers, remonter) et mise à jour immédiate
// du chemin après confirmation (déplacement des fichiers par l'instance).
import type { FilesystemResponse } from '@hubarr/shared';
import { msArrowBack, msFolderFill, msFolderOpen, msSync } from './symbols';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from './ConfirmDialog.vue';

const path = defineModel<string>({ required: true });
const props = defineProps<{
  label: string;
  /** Sous-dossiers d'un chemin du serveur de l'instance. */
  load: (path: string) => Promise<FilesystemResponse>;
  /** Dossier ouvert quand le champ est vide. */
  fallbackPath: string;
  /** Clés i18n : explorateur, mise à jour, dossier vide, confirmation (`{path}`). */
  keys: { explorer: string; update: string; empty: string; confirm: string };
  /** Préfixe des attributs `data-test` (`<préfixe>-path`, `<préfixe>-browser`). */
  testId: string;
}>();
const emit = defineEmits<{ updatePath: [path: string] }>();
const { t } = useI18n();

const browser = reactive({
  open: false,
  loading: false,
  path: '/',
  result: null as FilesystemResponse | null,
});

async function browse(target: string): Promise<void> {
  browser.open = true;
  browser.loading = true;
  browser.path = target;
  try {
    browser.result = await props.load(target);
  } catch {
    browser.result = { parent: null, directories: [] };
  } finally {
    browser.loading = false;
  }
}

function toggleBrowser(): void {
  if (browser.open) browser.open = false;
  else void browse(path.value !== '' ? path.value : props.fallbackPath);
}

function choose(target: string): void {
  path.value = target;
  void browse(target);
}

const confirmOpen = ref(false);
</script>

<template>
  <div>
    <v-text-field
      v-model="path"
      :label="label"
      density="compact"
      variant="outlined"
      hide-details
      :data-test="`${testId}-path`"
    >
      <template #append-inner>
        <v-btn
          :icon="browser.open ? msFolderOpen : msFolderFill"
          size="small"
          variant="text"
          :title="t(keys.explorer)"
          :aria-label="t(keys.explorer)"
          @click="toggleBrowser"
        />
        <v-btn
          :icon="msSync"
          size="small"
          variant="text"
          :title="t(keys.update)"
          :aria-label="t(keys.update)"
          :disabled="path.trim() === ''"
          @click="confirmOpen = true"
        />
      </template>
    </v-text-field>
    <v-card
      v-if="browser.open"
      variant="outlined"
      class="folder-path__browser"
      :data-test="`${testId}-browser`"
    >
      <div v-if="browser.loading" class="pa-2">
        <v-progress-linear indeterminate color="service" />
      </div>
      <v-list v-else density="compact" class="py-0">
        <v-list-item
          v-if="browser.path !== '/' && browser.result?.parent"
          :prepend-icon="msArrowBack"
          title=".."
          @click="choose(browser.result.parent)"
        />
        <v-list-item
          v-for="dir in browser.result?.directories ?? []"
          :key="dir.path"
          :prepend-icon="msFolderFill"
          :title="dir.name"
          @click="choose(dir.path)"
        />
        <v-list-item
          v-if="(browser.result?.directories ?? []).length === 0"
          :title="t(keys.empty)"
          class="text-muted"
        />
      </v-list>
    </v-card>
    <ConfirmDialog
      v-model="confirmOpen"
      :message="t(keys.confirm, { path: path.trim() })"
      @confirm="emit('updatePath', path.trim())"
    />
  </div>
</template>

<style scoped>
.folder-path__browser {
  max-height: 220px;
  overflow-y: auto;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
</style>
