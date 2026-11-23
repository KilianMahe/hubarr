<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Suppression d'un ou plusieurs torrents (`qbt-modal-delete`) : message nommé
// pour un seul, compté pour plusieurs, case « Supprimer aussi les fichiers ».
import type { TorrentClientId } from '@hubarr/shared';
import { computed, ref, watch } from 'vue';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { useTorrentI18n } from './use-torrent-i18n';

const props = defineProps<{ client: TorrentClientId; count: number; name: string | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ confirm: [deleteFiles: boolean] }>();
const { tk, tl } = useTorrentI18n(() => props.client);
const deleteFiles = ref(false);
watch(open, (value) => {
  if (value) deleteFiles.value = false;
});
const message = computed(() =>
  props.count > 1
    ? tk('modal_delete.msg_bulk_tpl', { count: props.count })
    : props.name !== null
      ? tl('modal_delete.msg_named_tpl', { NAME: props.name.slice(0, 60) })
      : tk('modal_delete.msg_single'),
);

function confirm(): void {
  const withFiles = deleteFiles.value;
  open.value = false;
  emit('confirm', withFiles);
}
</script>

<template>
  <ResponsiveDialog
    v-model="open"
    :title="tk('modal_delete.title')"
    title-color="error"
    :max-width="460"
  >
    <p class="text-body-large mb-2" data-test="torrent-delete-message">{{ message }}</p>
    <v-checkbox
      v-model="deleteFiles"
      :label="tk('modal_delete.delete_files')"
      color="error"
      hide-details
      data-test="torrent-delete-files"
    />
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ tk('modal_delete.cancel') }}</v-btn>
      <v-btn color="error" variant="flat" data-test="torrent-delete-confirm" @click="confirm">{{
        tk('modal_delete.confirm')
      }}</v-btn>
    </template>
  </ResponsiveDialog>
</template>
