<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Étiquettes de l'instance (`radarr/tags.html.twig`) : ajout, renommage,
// suppression confirmée ; Hubarr affiche aussi le nombre d'éléments qui
// utilisent chaque étiquette (`/tag/detail`).
import { arrTagItemSchema, arrTagUsageSchema } from '@hubarr/shared';
import { msAdd, msDelete, msEdit } from '../../../components/symbols';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'tags',
  '/tags',
  z.array(arrTagUsageSchema),
);
const confirm = useConfirmAction();

const newLabel = ref('');
const adding = ref(false);
async function add(): Promise<void> {
  const label = newLabel.value.trim();
  if (label === '') return;
  adding.value = true;
  const ok = await run(
    () => ctx.post('/tags/ajouter', { label }, arrTagItemSchema),
    ctx.key('created_error'),
    t(ctx.key('created_tpl'), { label }),
  );
  if (ok) newLabel.value = '';
  adding.value = false;
}

const renaming = ref<{ id: number; label: string } | null>(null);
const renameOpen = ref(false);
const renameError = ref<string | null>(null);
function openRename(tag: { id: number; label: string }): void {
  renaming.value = { ...tag };
  renameError.value = null;
  renameOpen.value = true;
}
async function rename(): Promise<void> {
  const target = renaming.value;
  if (target === null) return;
  try {
    await ctx.post(`/tags/${target.id}/renommer`, { label: target.label.trim() }, arrTagItemSchema);
    renameOpen.value = false;
    feedback.value = {
      type: 'success',
      text: t(ctx.key('renamed_tpl'), { label: target.label.trim() }),
    };
    await query.refetch();
  } catch (failure) {
    renameError.value = ctx.errorMessage(failure, ctx.key('rename_error'));
  }
}

function askDelete(tag: { id: number; label: string }): void {
  confirm.ask(t(ctx.key('delete_confirm_tpl'), { label: tag.label }), () =>
    run(() => ctx.post(`/tags/${tag.id}/supprimer`), ctx.key('delete_error')),
  );
}
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :count="query.data.value?.length ?? null"
    :loading="query.isPending.value"
    :error="error"
  >
    <v-card variant="flat" border class="mb-4">
      <v-card-title class="text-title-medium">{{ t(ctx.key('add_card_title')) }}</v-card-title>
      <v-card-text>
        <form class="d-flex ga-2" @submit.prevent="add">
          <v-text-field
            v-model="newLabel"
            :placeholder="t(ctx.key('add_placeholder'))"
            variant="outlined"
            density="compact"
            hide-details
            data-test="tag-new-label"
          />
          <v-btn
            type="submit"
            color="service"
            :prepend-icon="msAdd"
            :loading="adding"
            :disabled="newLabel.trim() === ''"
            data-test="tag-add"
            >{{ t(ctx.key('add_button')) }}</v-btn
          >
        </form>
      </v-card-text>
    </v-card>
    <v-card variant="flat" border>
      <v-card-title class="text-title-medium">{{ t(ctx.key('existing_card_title')) }}</v-card-title>
      <v-list v-if="(query.data.value ?? []).length > 0" density="compact">
        <v-list-item
          v-for="tag in query.data.value"
          :key="tag.id"
          :title="tag.label"
          data-test="tag-row"
        >
          <template #append>
            <v-chip
              size="x-small"
              variant="tonal"
              class="me-2"
              :title="t('media.arr_admin.tags_usage')"
              >{{ tag.usage }}</v-chip
            >
            <v-btn
              :icon="msEdit"
              variant="text"
              size="small"
              :aria-label="t(ctx.key('btn_rename'))"
              :title="t(ctx.key('btn_rename'))"
              data-test="tag-rename"
              @click="openRename(tag)"
            />
            <v-btn
              :icon="msDelete"
              variant="text"
              color="error"
              size="small"
              :aria-label="t(ctx.key('btn_delete'))"
              :title="t(ctx.key('btn_delete'))"
              data-test="tag-delete"
              @click="askDelete(tag)"
            />
          </template>
        </v-list-item>
      </v-list>
      <v-card-text v-else class="text-center text-muted py-6">{{
        t(ctx.key('empty'))
      }}</v-card-text>
    </v-card>

    <AdminDialog
      v-model="renameOpen"
      :title="t(ctx.key('btn_rename'))"
      :error="renameError"
      :max-width="420"
      @save="rename"
    >
      <v-text-field
        v-if="renaming"
        v-model="renaming.label"
        :label="t(ctx.key('rename_prompt'))"
        variant="outlined"
        density="compact"
        autofocus
        data-test="tag-rename-label"
        @keydown.enter="rename"
      />
    </AdminDialog>
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </AdminPage>
</template>
