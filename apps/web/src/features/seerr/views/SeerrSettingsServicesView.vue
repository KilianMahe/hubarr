<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Services de Seerr (`settings/services.html.twig`, routes n° 87-97) :
// serveurs Radarr et Sonarr (ajout, modification, test, suppression), avec
// leurs profils et dossiers ; règles de substitution (liste, ajout,
// modification, suppression). Les clés d'API restent masquées : un masque
// laissé tel quel garde la clé enregistrée (serveur).
import { SEERR_SECRET_MASK } from '@hubarr/shared';
import { mdiDelete, mdiPencil, mdiPlus } from '@mdi/js';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorText } from '../../../app/api/error-text';
import { fillLegacy } from '../../../app/legacy-template';
import { useNotifyStore } from '../../../app/stores/notify';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import ResponsiveDialog from '../../../components/ResponsiveDialog.vue';
import SeerrPage from '../SeerrPage.vue';
import { field, seerrApi, text } from '../seerr-api';

type Row = Record<string, unknown>;
type Kind = 'radarr' | 'sonarr';
const { t } = useI18n();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const KINDS: Kind[] = ['radarr', 'sonarr'];
const services = useQuery({
  queryKey: ['seerr', 'services'],
  queryFn: ({ signal }) => seerrApi.services(signal),
  retry: false,
});

const directory = computed({
  get: () => (typeof server.activeDirectory === 'string' ? server.activeDirectory : null),
  set: (value: string | null) => {
    server.activeDirectory = value;
  },
});
const serverUrl = (srv: Row) =>
  `${srv.useSsl === true ? 'https' : 'http'}://${text(srv.hostname)}:${text(srv.port)}${text(srv.baseUrl)}`;
const seriesTypes = computed(() =>
  ['standard', 'daily', 'anime'].map((value) => ({
    value,
    title: t(`jellyseerr.settings.services.series_type_${value}`),
  })),
);
const serversOf = (kind: Kind): Row[] =>
  (kind === 'radarr' ? services.data.value?.radarr : services.data.value?.sonarr) ?? [];

async function run(task: () => Promise<unknown>, after?: () => void): Promise<boolean> {
  try {
    await task();
    notify.success('jellyseerr.common.saved');
    after?.();
    await queryClient.invalidateQueries({ queryKey: ['seerr', 'services'] });
    return true;
  } catch (error) {
    notify.error('common.labels.text', {
      text: apiErrorText(error, t, 'jellyseerr.settings.services.test_connection_failed'),
    });
    return false;
  }
}

// Serveur : formulaire commun Radarr/Sonarr.
const dialog = reactive<{
  open: boolean;
  kind: Kind;
  id: number | null;
  testing: boolean;
  tested: Row | null;
}>({
  open: false,
  kind: 'radarr',
  id: null as number | null,
  testing: false,
  tested: null as Row | null,
});
const server = reactive<Row>({});
function openServer(kind: Kind, row: Row | null): void {
  dialog.kind = kind;
  dialog.id = row === null ? null : field<number>(row, 'id', 0);
  dialog.tested = null;
  for (const key of Object.keys(server)) Reflect.deleteProperty(server, key);
  Object.assign(server, {
    name: '',
    hostname: '',
    port: kind === 'radarr' ? 7878 : 8989,
    apiKey: '',
    useSsl: false,
    baseUrl: '',
    externalUrl: '',
    activeProfileId: null,
    activeDirectory: '',
    is4k: false,
    isDefault: false,
    syncEnabled: false,
    preventSearch: false,
    tagRequests: false,
    ...(kind === 'radarr'
      ? { minimumAvailability: 'released' }
      : { seriesType: 'standard', animeSeriesType: 'anime', enableSeasonFolders: true }),
    ...(row ?? {}),
  });
  dialog.open = true;
}
const profilesOf = computed(() => {
  const data = services.data.value;
  const fromTest = dialog.tested;
  const info =
    fromTest ??
    (dialog.id === null
      ? null
      : ((dialog.kind === 'radarr' ? data?.radarrProfiles : data?.sonarrProfiles)?.[
          String(dialog.id)
        ] ?? null));
  return {
    profiles: (field<unknown[]>(info, 'profiles', []) as Row[]).map((p) => ({
      value: Number(p.id),
      title: text(p.name, p.id),
    })),
    folders: (field<unknown[]>(info, 'rootFolders', []) as Row[])
      .map((f) => text(f.path))
      .filter((p) => p !== ''),
  };
});
async function testServer(): Promise<void> {
  dialog.testing = true;
  try {
    const result = await seerrApi.testServer(dialog.kind, {
      ...server,
      id: dialog.id ?? undefined,
    });
    dialog.tested = (result.data ?? {}) as Row;
    notify.success('jellyseerr.settings.services.test_connection_success_simple');
  } catch (error) {
    notify.error('common.labels.text', {
      text: apiErrorText(error, t, 'jellyseerr.settings.services.test_connection_failed'),
    });
  } finally {
    dialog.testing = false;
  }
}
const saveServer = () =>
  run(
    () =>
      seerrApi.saveServer(dialog.kind, dialog.id, { ...server, port: Number(server.port) || 0 }),
    () => (dialog.open = false),
  );
const deleteTarget = ref<{ kind: Kind; id: number } | null>(null);
const deleteOpen = ref(false);

// Règles de substitution.
const ruleDialog = reactive({ open: false });
const rule = reactive<Row>({});
function openRule(row: Row | null): void {
  for (const key of Object.keys(rule)) Reflect.deleteProperty(rule, key);
  Object.assign(rule, {
    radarrServiceId: null,
    sonarrServiceId: null,
    genre: null,
    language: null,
    users: null,
    profileId: null,
    rootFolder: null,
    ...(row ?? {}),
  });
  ruleDialog.open = true;
}
const genres = computed(() =>
  (services.data.value?.genres ?? []).map((g) => ({
    value: text(g.id),
    title: text(g.name, g.id),
  })),
);
const languages = computed(() =>
  (services.data.value?.languages ?? []).map((l) => ({
    value: text(l.iso_639_1),
    title: text(l.english_name, l.iso_639_1),
  })),
);
const users = computed(() =>
  (services.data.value?.users ?? []).map((u) => ({
    value: text(u.id),
    title: text(u.displayName, u.email, u.id),
  })),
);
const serverItems = (kind: Kind) =>
  ((kind === 'radarr' ? services.data.value?.radarr : services.data.value?.sonarr) ?? []).map(
    (s) => ({ value: Number(s.id), title: text(s.name, s.id) }),
  );
const ruleSummary = (r: Row) =>
  [
    r.radarrServiceId != null
      ? `Radarr #${text(r.radarrServiceId)}`
      : r.sonarrServiceId != null
        ? `Sonarr #${text(r.sonarrServiceId)}`
        : null,
    r.genre ? `${t('jellyseerr.settings.services.rules_genre_label')} ${text(r.genre)}` : null,
    r.users ? `${t('jellyseerr.settings.services.rules_users_label')} ${text(r.users)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
</script>

<template>
  <SeerrPage
    :title="t('jellyseerr.settings.services.title')"
    :loading="services.isPending.value"
    :error="services.isError.value"
  >
    <v-row v-if="services.data.value" density="compact">
      <v-col v-for="kind in KINDS" :key="kind" cols="12" md="6">
        <v-card variant="flat" border :data-test="'seerr-' + kind + '-servers'">
          <v-card-title class="d-flex align-center text-title-small">
            {{ t('jellyseerr.settings.services.' + kind + '_settings') }}
            <v-spacer />
            <v-btn
              :prepend-icon="mdiPlus"
              size="small"
              variant="tonal"
              :data-test="'seerr-add-' + kind"
              @click="openServer(kind, null)"
              >{{ t('jellyseerr.settings.services.add_' + kind) }}</v-btn
            >
          </v-card-title>
          <v-list density="compact">
            <v-list-item
              v-for="srv in serversOf(kind)"
              :key="text(srv.id)"
              :title="text(srv.name)"
              :subtitle="serverUrl(srv)"
              data-test="seerr-server"
            >
              <template #append>
                <v-chip v-if="srv.isDefault" size="x-small" label class="me-1">{{
                  t('jellyseerr.settings.services.default_badge')
                }}</v-chip>
                <v-chip v-if="srv.is4k" size="x-small" label class="me-1">4K</v-chip>
                <v-btn
                  :icon="mdiPencil"
                  size="small"
                  variant="text"
                  :aria-label="t('jellyseerr.common.edit')"
                  data-test="seerr-server-edit"
                  @click="openServer(kind, srv)"
                />
                <v-btn
                  :icon="mdiDelete"
                  size="small"
                  variant="text"
                  color="error"
                  :aria-label="t('jellyseerr.common.delete')"
                  @click="
                    deleteTarget = { kind, id: Number(srv.id) };
                    deleteOpen = true;
                  "
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
      <v-col cols="12">
        <v-card variant="flat" border data-test="seerr-rules">
          <v-card-title class="d-flex align-center text-title-small">
            {{ t('jellyseerr.settings.services.rules_title') }}
            <v-spacer />
            <v-btn :prepend-icon="mdiPlus" size="small" variant="tonal" @click="openRule(null)">{{
              t('jellyseerr.common.add')
            }}</v-btn>
          </v-card-title>
          <v-card-subtitle>{{ t('jellyseerr.settings.services.rules_subtitle') }}</v-card-subtitle>
          <p v-if="services.data.value.rules.length === 0" class="text-muted px-4 py-2">
            {{ t('jellyseerr.settings.services.rules_no_rules') }}
          </p>
          <v-list v-else density="compact">
            <v-list-item
              v-for="r in services.data.value.rules"
              :key="text(r.id)"
              :title="ruleSummary(r) || `#${text(r.id)}`"
            >
              <template #append>
                <v-btn
                  :icon="mdiPencil"
                  size="small"
                  variant="text"
                  :aria-label="t('jellyseerr.common.edit')"
                  @click="openRule(r)"
                />
                <v-btn
                  :icon="mdiDelete"
                  size="small"
                  variant="text"
                  color="error"
                  :aria-label="t('jellyseerr.common.delete')"
                  @click="run(() => seerrApi.deleteRule(Number(r.id)))"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <ResponsiveDialog
      v-model="dialog.open"
      :title="
        fillLegacy(
          t(
            dialog.id === null
              ? 'jellyseerr.settings.services.modal_add_title_tpl'
              : 'jellyseerr.settings.services.modal_edit_title_tpl',
          ),
          { TYPE: dialog.kind === 'radarr' ? 'Radarr' : 'Sonarr' },
        )
      "
      :max-width="640"
    >
      <div data-test="seerr-server-dialog">
        <div class="d-flex ga-4">
          <v-switch
            v-model="server.isDefault"
            :label="t('jellyseerr.settings.services.default_server')"
            color="service"
            density="compact"
            hide-details
          />
          <v-switch
            v-model="server.is4k"
            :label="t('jellyseerr.settings.services.server_4k')"
            color="service"
            density="compact"
            hide-details
          />
        </div>
        <v-text-field
          v-model="server.name"
          :label="t('jellyseerr.settings.services.server_name')"
          density="compact"
          data-test="seerr-server-name"
        />
        <v-row density="compact">
          <v-col cols="8"
            ><v-text-field
              v-model="server.hostname"
              :label="t('jellyseerr.settings.services.hostname_or_ip')"
              density="compact"
          /></v-col>
          <v-col cols="4"
            ><v-text-field
              v-model="server.port"
              :label="t('media.arr_admin.settings.proxy.port')"
              type="number"
              density="compact"
          /></v-col>
        </v-row>
        <v-switch
          v-model="server.useSsl"
          :label="t('jellyseerr.settings.services.enable_ssl')"
          color="service"
          density="compact"
          hide-details
        />
        <v-text-field
          v-model="server.apiKey"
          :label="t('jellyseerr.settings.services.api_key')"
          :placeholder="SEERR_SECRET_MASK"
          type="password"
          density="compact"
          data-test="seerr-server-key"
        />
        <v-text-field
          v-model="server.baseUrl"
          :label="t('jellyseerr.settings.services.base_url')"
          density="compact"
        />
        <v-text-field
          v-model="server.externalUrl"
          :label="t('jellyseerr.settings.services.external_url')"
          density="compact"
        />
        <v-select
          v-model="server.activeProfileId"
          :items="profilesOf.profiles"
          :label="t('jellyseerr.settings.services.quality_profile')"
          density="compact"
        />
        <v-select
          v-model="directory"
          :items="profilesOf.folders"
          :label="t('jellyseerr.settings.services.root_folder')"
          density="compact"
        />
        <v-select
          v-if="dialog.kind === 'radarr'"
          v-model="server.minimumAvailability"
          :items="[
            { value: 'announced', title: t('jellyseerr.settings.services.avail_announced') },
            { value: 'inCinemas', title: t('jellyseerr.settings.services.avail_in_cinemas') },
            { value: 'released', title: t('jellyseerr.settings.services.avail_released') },
          ]"
          :label="t('jellyseerr.settings.services.minimum_availability')"
          density="compact"
        />
        <template v-else>
          <v-select
            v-model="server.seriesType"
            :items="seriesTypes"
            :label="t('jellyseerr.settings.services.series_type')"
            density="compact"
          />
          <v-switch
            v-model="server.enableSeasonFolders"
            :label="t('jellyseerr.settings.services.auto_season_folders')"
            color="service"
            density="compact"
            hide-details
          />
        </template>
        <v-switch
          v-model="server.syncEnabled"
          :label="t('jellyseerr.settings.services.enable_sync')"
          color="service"
          density="compact"
          hide-details
        />
        <v-switch
          :model-value="!server.preventSearch"
          :label="t('jellyseerr.settings.services.enable_search')"
          color="service"
          density="compact"
          hide-details
          @update:model-value="server.preventSearch = !$event"
        />
        <v-switch
          v-model="server.tagRequests"
          :label="t('jellyseerr.settings.services.tag_requests')"
          color="service"
          density="compact"
          hide-details
        />
      </div>
      <template #actions>
        <v-btn
          variant="tonal"
          :loading="dialog.testing"
          data-test="seerr-server-test"
          @click="testServer"
          >{{ t('jellyseerr.settings.services.modal_test') }}</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="dialog.open = false">{{
          t('jellyseerr.settings.services.modal_cancel')
        }}</v-btn>
        <v-btn color="service" variant="flat" data-test="seerr-server-save" @click="saveServer">{{
          t('jellyseerr.settings.services.modal_save')
        }}</v-btn>
      </template>
    </ResponsiveDialog>

    <ResponsiveDialog
      v-model="ruleDialog.open"
      :title="t('jellyseerr.settings.services.rules_title')"
      :max-width="560"
    >
      <v-select
        v-model="rule.radarrServiceId"
        :items="serverItems('radarr')"
        label="Radarr"
        clearable
        density="compact"
      />
      <v-select
        v-model="rule.sonarrServiceId"
        :items="serverItems('sonarr')"
        label="Sonarr"
        clearable
        density="compact"
      />
      <v-select
        v-model="rule.genre"
        :items="genres"
        :label="t('jellyseerr.settings.services.rules_genre_label')"
        clearable
        density="compact"
      />
      <v-select
        v-model="rule.language"
        :items="languages"
        :label="t('jellyseerr.user_detail.discover_language')"
        clearable
        density="compact"
      />
      <v-select
        v-model="rule.users"
        :items="users"
        :label="t('jellyseerr.settings.services.rules_users_label')"
        clearable
        density="compact"
      />
      <v-text-field
        v-model="rule.profileId"
        :label="t('jellyseerr.settings.services.quality_profile')"
        type="number"
        density="compact"
      />
      <v-text-field
        v-model="rule.rootFolder"
        :label="t('jellyseerr.settings.services.root_folder')"
        density="compact"
      />
      <template #actions>
        <v-btn variant="text" @click="ruleDialog.open = false">{{
          t('jellyseerr.common.cancel')
        }}</v-btn>
        <v-btn
          color="service"
          variant="flat"
          @click="
            run(
              () =>
                seerrApi.saveRule({
                  ...rule,
                  profileId: rule.profileId ? Number(rule.profileId) : null,
                }),
              () => (ruleDialog.open = false),
            )
          "
          >{{ t('jellyseerr.common.save') }}</v-btn
        >
      </template>
    </ResponsiveDialog>

    <ConfirmDialog
      v-model="deleteOpen"
      :message="
        fillLegacy(t('jellyseerr.common.confirm_delete_server_tpl'), {
          TYPE: deleteTarget?.kind === 'sonarr' ? 'Sonarr' : 'Radarr',
        })
      "
      :confirm-label="t('jellyseerr.common.delete')"
      danger
      @confirm="
        deleteTarget && run(() => seerrApi.deleteServer(deleteTarget!.kind, deleteTarget!.id))
      "
    />
  </SeerrPage>
</template>
