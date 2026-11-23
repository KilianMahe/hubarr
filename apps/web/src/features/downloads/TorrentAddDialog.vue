<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ajout de torrents (`qbt-modal-add` de l'original) : liens (un par ligne),
// fichiers `.torrent` par glisser-déposer ou parcourir (les autres sont
// ignorés avec un message), catégorie (si le client la gère), dossier
// (Hubarr), démarrage ou pause. Fichiers envoyés d'abord, puis les liens ;
// le dialogue se ferme si tout est parti.
import { TORRENT_CAPABILITIES, type TorrentClientId } from '@hubarr/shared';
import { mdiClose, mdiFileUpload } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { apiErrorText } from '../../app/api/error-text';
import { useFormat } from '../../app/format';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { fileToBase64, torrentsApi } from './torrents-api';
import { useTorrentI18n } from './use-torrent-i18n';

const props = defineProps<{ client: TorrentClientId; categories: string[] }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ added: [] }>();
const format = useFormat();
const { t, tk, tl, say } = useTorrentI18n(() => props.client);
const caps = computed(() => TORRENT_CAPABILITIES[props.client]);

const urls = ref('');
const files = ref<File[]>([]);
const category = ref<string | null>(null);
const savepath = ref('');
const paused = ref(false);
const sending = ref(false);
const dragging = ref(false);
const input = ref<HTMLInputElement | null>(null);

watch(open, (value) => {
  if (!value) return;
  urls.value = '';
  files.value = [];
  savepath.value = '';
});

function addFiles(list: FileList | null): void {
  for (const file of Array.from(list ?? [])) {
    if (file.name.toLowerCase().endsWith('.torrent')) files.value.push(file);
    else say.info(tl('toast.file_ignored_tpl', { NAME: file.name }));
  }
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  addFiles(event.dataTransfer?.files ?? null);
}

async function submit(): Promise<void> {
  const links = urls.value.trim();
  if (links === '' && files.value.length === 0) {
    say.error(tk('toast.add_required'));
    return;
  }
  sending.value = true;
  const api = torrentsApi(props.client);
  const options = {
    ...(caps.value.setCategory && category.value ? { category: category.value } : {}),
    ...(savepath.value.trim() ? { savepath: savepath.value.trim() } : {}),
    paused: paused.value,
  };
  let ok = true;
  try {
    if (files.value.length > 0) {
      try {
        const payload = await Promise.all(
          files.value.map(async (file) => ({ name: file.name, content: await fileToBase64(file) })),
        );
        const result = await api.addFiles(payload, options);
        say.success(tk('toast.add_files_ok_tpl', { count: result.count }));
      } catch (error) {
        ok = false;
        say.error(apiErrorText(error, t, `${props.client}.toast.add_files_ko`));
      }
    }
    if (links !== '') {
      try {
        await api.addUrls(links, options);
        say.success(tk('toast.add_url_ok'));
      } catch (error) {
        ok = false;
        say.error(apiErrorText(error, t, `${props.client}.toast.add_url_ko`));
      }
    }
  } finally {
    sending.value = false;
  }
  if (ok) {
    open.value = false;
    emit('added');
  }
}
</script>

<template>
  <ResponsiveDialog v-model="open" :title="tk('modal_add.title')" :max-width="620">
    <div data-test="torrent-add">
      <v-textarea
        v-model="urls"
        :label="tk('modal_add.urls_label')"
        :placeholder="tk('modal_add.urls_placeholder')"
        :hint="tk('modal_add.urls_hint')"
        persistent-hint
        rows="3"
        auto-grow
        data-test="torrent-add-urls"
      />
      <div class="text-caption text-muted mt-4 mb-1">{{ tk('modal_add.files_label') }}</div>
      <v-sheet
        border
        rounded
        class="pa-4 text-center cursor-pointer"
        :color="dragging ? 'surface-variant' : undefined"
        data-test="torrent-drop"
        @click="input?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <v-icon :icon="mdiFileUpload" size="28" class="mb-1" />
        <div class="text-body-medium">
          {{ tk('modal_add.drop_text').replace(/<[^>]+>/g, '') }}
        </div>
        <div class="text-caption text-muted">{{ tk('modal_add.drop_browse') }}</div>
        <input
          ref="input"
          type="file"
          accept=".torrent"
          multiple
          hidden
          data-test="torrent-file-input"
          @change="
            addFiles(($event.target as HTMLInputElement).files);
            ($event.target as HTMLInputElement).value = '';
          "
        />
      </v-sheet>
      <v-list v-if="files.length > 0" density="compact">
        <v-list-item
          v-for="(file, index) in files"
          :key="index"
          :title="file.name"
          :subtitle="format.bytes(file.size)"
        >
          <template #append>
            <v-btn
              :icon="mdiClose"
              size="small"
              variant="text"
              :aria-label="tk('modal_add.file_remove_title')"
              @click="files.splice(index, 1)"
            />
          </template>
        </v-list-item>
      </v-list>
      <v-row density="compact" class="mt-3">
        <v-col v-if="caps.setCategory" cols="12" sm="6">
          <v-combobox
            v-model="category"
            :items="categories"
            :label="tk('modal_add.category_label')"
            :placeholder="tk('modal_add.category_none')"
            clearable
            density="compact"
          />
        </v-col>
        <v-col cols="12" :sm="caps.setCategory ? 6 : 12">
          <v-text-field
            v-model="savepath"
            :label="tk('modal_add.savepath_label')"
            density="compact"
          />
        </v-col>
      </v-row>
      <v-radio-group v-model="paused" inline :label="tk('modal_add.start_label')" hide-details>
        <v-radio :value="false" :label="tk('modal_add.start_now')" />
        <v-radio :value="true" :label="tk('modal_add.start_paused')" />
      </v-radio-group>
    </div>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ tk('modal_add.cancel') }}</v-btn>
      <v-btn
        color="service"
        variant="flat"
        :loading="sending"
        data-test="torrent-add-submit"
        @click="submit"
        >{{ tk('modal_add.submit') }}</v-btn
      >
    </template>
  </ResponsiveDialog>
</template>
