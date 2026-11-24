<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Profils de délai (`radarr/delay_profiles.html.twig`) : liste par ordre,
// ajout, modification, suppression confirmée. Les étiquettes se choisissent
// par leur nom (l'original demandait leurs ids séparés par des virgules) ; le
// profil par défaut (sans étiquette, dernier) ne se supprime pas.
import { delayProfileSchema, type DelayProfile } from '@hubarr/shared';
import { msAdd, msDelete, msEdit } from '../../../components/symbols';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction, useInstanceTags } from '../admin-api';
import { isDefaultDelayProfile, toNumber } from '../admin-format';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'delay_profiles',
  '/profils-delai',
  z.array(delayProfileSchema),
);
const tags = useInstanceTags(ctx);
const confirm = useConfirmAction();

interface DelayForm {
  enableUsenet: boolean;
  enableTorrent: boolean;
  preferredProtocol: string;
  usenetDelay: number;
  torrentDelay: number;
  bypassIfHighestQuality: boolean;
  bypassIfAboveCustomFormatScore: boolean;
  minimumCustomFormatScore: number;
  tags: number[];
}

const open = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const editing = ref<DelayProfile | null>(null);
const form = reactive<DelayForm>({
  enableUsenet: true,
  enableTorrent: true,
  preferredProtocol: 'usenet',
  usenetDelay: 0,
  torrentDelay: 0,
  bypassIfHighestQuality: true,
  bypassIfAboveCustomFormatScore: false,
  minimumCustomFormatScore: 0,
  tags: [],
});

function edit(profile: DelayProfile | null): void {
  editing.value = profile;
  formError.value = null;
  Object.assign(form, {
    enableUsenet: profile?.enableUsenet ?? true,
    enableTorrent: profile?.enableTorrent ?? true,
    preferredProtocol: profile?.preferredProtocol ?? 'usenet',
    usenetDelay: profile?.usenetDelay ?? 0,
    torrentDelay: profile?.torrentDelay ?? 0,
    bypassIfHighestQuality: profile?.bypassIfHighestQuality ?? true,
    bypassIfAboveCustomFormatScore: profile?.bypassIfAboveCustomFormatScore ?? false,
    minimumCustomFormatScore: profile?.minimumCustomFormatScore ?? 0,
    tags: [...(profile?.tags ?? [])],
  });
  open.value = true;
}

async function save(): Promise<void> {
  saving.value = true;
  formError.value = null;
  const payload = {
    ...(editing.value ?? {}),
    ...form,
    usenetDelay: toNumber(form.usenetDelay),
    torrentDelay: toNumber(form.torrentDelay),
    minimumCustomFormatScore: toNumber(form.minimumCustomFormatScore),
  };
  try {
    const id = editing.value?.id;
    if (id === undefined) await ctx.post('/profils-delai/ajouter', payload, delayProfileSchema);
    else await ctx.post(`/profils-delai/${id}/modifier`, payload, delayProfileSchema);
    open.value = false;
    await query.refetch();
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.key('error_save'));
  } finally {
    saving.value = false;
  }
}

function askDelete(profile: DelayProfile): void {
  if (profile.id === undefined) return;
  const id = profile.id;
  confirm.ask(t(ctx.key('confirm_delete')), () =>
    run(() => ctx.post(`/profils-delai/${id}/supprimer`), ctx.key('error_delete')),
  );
}

const protocols = [
  { value: 'usenet', title: 'Usenet' },
  { value: 'torrent', title: 'Torrent' },
];
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
    <template #actions>
      <v-btn
        color="service"
        :prepend-icon="msAdd"
        size="small"
        data-test="delay-add"
        @click="edit(null)"
        >{{ t(ctx.key('add')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_tags')) }}</th>
            <th>{{ t(ctx.key('col_protocol')) }}</th>
            <th>{{ t(ctx.key('col_delay_usenet')) }}</th>
            <th>{{ t(ctx.key('col_delay_torrent')) }}</th>
            <th>{{ t(ctx.key('col_bypass_cutoff')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="profile in query.data.value" :key="profile.id" data-test="delay-row">
            <td>
              <template v-if="(profile.tags ?? []).length > 0">
                <v-chip v-for="tag in profile.tags" :key="tag" size="x-small" class="me-1">{{
                  tags.labelOf(tag)
                }}</v-chip>
              </template>
              <v-chip v-else size="x-small" variant="tonal" color="info">{{
                t(ctx.key(isDefaultDelayProfile(profile) ? 'default' : 'tags_global'))
              }}</v-chip>
            </td>
            <td>
              <span v-if="profile.enableUsenet && profile.enableTorrent">{{
                profile.preferredProtocol === 'torrent' ? 'Torrent' : 'Usenet'
              }}</span>
              <span v-else>{{ profile.enableTorrent ? 'Torrent' : 'Usenet' }}</span>
            </td>
            <td>{{ profile.enableUsenet ? (profile.usenetDelay ?? 0) : '—' }}</td>
            <td>{{ profile.enableTorrent ? (profile.torrentDelay ?? 0) : '—' }}</td>
            <td>{{ t(ctx.key(profile.bypassIfHighestQuality ? 'yes' : 'no')) }}</td>
            <td class="text-end text-no-wrap">
              <v-btn
                :icon="msEdit"
                variant="text"
                size="small"
                :aria-label="t(ctx.key('edit'))"
                :title="t(ctx.key('edit'))"
                data-test="delay-edit"
                @click="edit(profile)"
              />
              <v-btn
                v-if="!isDefaultDelayProfile(profile)"
                :icon="msDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key('delete'))"
                :title="t(ctx.key('delete'))"
                data-test="delay-delete"
                @click="askDelete(profile)"
              />
            </td>
          </tr>
          <tr v-if="(query.data.value ?? []).length === 0">
            <td colspan="6" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <AdminDialog
      v-model="open"
      :title="
        editing?.id ? t(ctx.key('modal_edit_tpl'), { id: editing.id }) : t(ctx.key('modal_new'))
      "
      :error="formError"
      :saving="saving"
      :save-label="t(ctx.key(editing ? 'save' : 'create'))"
      @save="save"
    >
      <div class="d-flex flex-wrap ga-4">
        <v-switch
          v-model="form.enableUsenet"
          :label="t(ctx.key('enable_usenet'))"
          color="service"
          density="compact"
          hide-details
        />
        <v-switch
          v-model="form.enableTorrent"
          :label="t(ctx.key('enable_torrent'))"
          color="service"
          density="compact"
          hide-details
        />
      </div>
      <v-select
        v-model="form.preferredProtocol"
        :items="protocols"
        :label="t(ctx.key('preferred_protocol'))"
        :disabled="!(form.enableUsenet && form.enableTorrent)"
        variant="outlined"
        density="compact"
        class="mt-4"
      />
      <v-row density="compact">
        <v-col cols="12" sm="6">
          <v-text-field
            v-model.number="form.usenetDelay"
            :label="t(ctx.key('usenet_delay'))"
            type="number"
            min="0"
            :disabled="!form.enableUsenet"
            variant="outlined"
            density="compact"
            data-test="delay-usenet"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model.number="form.torrentDelay"
            :label="t(ctx.key('torrent_delay'))"
            type="number"
            min="0"
            :disabled="!form.enableTorrent"
            variant="outlined"
            density="compact"
          />
        </v-col>
      </v-row>
      <v-checkbox
        v-model="form.bypassIfHighestQuality"
        :label="t(ctx.key('bypass_highest'))"
        color="service"
        density="compact"
        hide-details
      />
      <v-checkbox
        v-model="form.bypassIfAboveCustomFormatScore"
        :label="t(ctx.key('bypass_cf_score'))"
        color="service"
        density="compact"
        hide-details
      />
      <v-text-field
        v-if="form.bypassIfAboveCustomFormatScore"
        v-model.number="form.minimumCustomFormatScore"
        :label="t(ctx.key('min_cf_score'))"
        type="number"
        variant="outlined"
        density="compact"
        class="mt-2"
      />
      <v-select
        v-if="!(editing && isDefaultDelayProfile(editing))"
        v-model="form.tags"
        :items="tags.items.value"
        :label="t('media.arr_admin.tags.page_title')"
        multiple
        chips
        closable-chips
        variant="outlined"
        density="compact"
        class="mt-4"
        data-test="delay-tags"
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
