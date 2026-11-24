<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Liste d'une famille de ressources à schéma (`radarr/indexers.html.twig`,
// `download_clients`, `import_lists`, `notifications`, `metadata`) : colonnes
// propres à la famille, ajout, modification, test, suppression confirmée ;
// métadonnées : activer ou désactiver d'un clic (leurs réglages, n° 425-426,
// n'ont pas d'écran dans l'original : API seule).
import { providerListSchema, providerTestResponseSchema, type Provider } from '@hubarr/shared';
import {
  msAdd,
  msCancelFill,
  msCheckCircleFill,
  msDelete,
  msEdit,
  msScience,
} from '../../components/symbols';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import AdminPage from './AdminPage.vue';
import ProviderDialog from './ProviderDialog.vue';
import {
  useAdminPage,
  useConfirmAction,
  useInstanceTags,
  useProfilesAndFolders,
} from './admin-api';
import {
  PROVIDER_FAMILY_SPECS,
  activeTriggers,
  fieldValue,
  providerPayload,
  triggerLabelKey,
  type ProviderFamilyId,
} from './providers';
import { initialValues } from './schema-form';

const props = defineProps<{ family: ProviderFamilyId }>();
const spec = computed(() => PROVIDER_FAMILY_SPECS[props.family]);
const { t } = useI18n();
const router = useRouter();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  PROVIDER_FAMILY_SPECS[props.family].prefix,
  `/${PROVIDER_FAMILY_SPECS[props.family].segment}`,
  providerListSchema,
);
const confirm = useConfirmAction();
const tags = useInstanceTags(ctx);
const lists = useProfilesAndFolders(ctx, () => props.family === 'importLists');
const items = computed(() => query.data.value ?? []);

const dialogOpen = ref(false);
const editing = ref<Provider | null>(null);
function edit(item: Provider | null): void {
  editing.value = item;
  dialogOpen.value = true;
}

const testing = ref<number | null>(null);
async function test(item: Provider): Promise<void> {
  if (item.id === undefined) return;
  testing.value = item.id;
  const name = item.name ?? '—';
  try {
    const result =
      spec.value.rowTest === 'id'
        ? await ctx.post(`/${spec.value.segment}/${item.id}/tester`, {}, providerTestResponseSchema)
        : await ctx.post(
            `/${spec.value.segment}/${spec.value.testRoute ?? 'tester'}`,
            providerPayload(
              item,
              item,
              {
                name: item.name ?? '',
                values: initialValues(item),
                tags: item.tags ?? [],
                options: {},
                triggers: {},
              },
              item,
            ),
            providerTestResponseSchema,
          );
    feedback.value = result.ok
      ? { type: 'success', text: testSuccess(name) }
      : {
          type: 'error',
          text: testFailure(name, result.message ?? t('media.arr_admin.schema_modal.test_failure')),
        };
  } catch (failure) {
    feedback.value = {
      type: 'error',
      text: testFailure(
        name,
        ctx.errorMessage(failure, 'media.arr_admin.schema_modal.error_network_test'),
      ),
    };
  } finally {
    testing.value = null;
  }
}

function testSuccess(name: string): string {
  return props.family === 'notifications'
    ? `${name} — ${t('media.arr_admin.schema_modal.test_success')}`
    : t(ctx.key('test_success_feedback_tpl'), { name });
}
function testFailure(name: string, message: string): string {
  return props.family === 'notifications'
    ? `${name} — ${message}`
    : t(ctx.key('test_failure_feedback_tpl'), { name, error: message });
}

function askDelete(item: Provider): void {
  if (item.id === undefined) return;
  const id = item.id;
  confirm.ask(t(ctx.key(spec.value.labels.confirmDelete), { name: item.name ?? '' }), () =>
    run(
      () => ctx.post(`/${spec.value.segment}/${id}/supprimer`),
      ctx.key(spec.value.labels.errorDelete),
    ),
  );
}

/** Métadonnées : bascule « Actif » (ressource complète renvoyée). */
async function toggle(item: Provider): Promise<void> {
  if (item.id === undefined) return;
  const id = item.id;
  await run(
    () =>
      ctx.post(
        `/${spec.value.segment}/${id}/modifier`,
        providerPayload(
          item,
          item,
          {
            name: item.name ?? '',
            values: initialValues(item),
            tags: item.tags ?? [],
            options: { enable: item.enable !== true },
            triggers: {},
          },
          item,
        ),
      ),
    ctx.key('err_save'),
  );
}

const enabled = (item: Provider) =>
  props.family === 'importLists'
    ? item.enabled === true || item.enableAutomaticAdd === true
    : props.family === 'indexers'
      ? item.enableRss === true ||
        item.enableAutomaticSearch === true ||
        item.enableInteractiveSearch === true
      : item.enable === true;
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
const yesNo = (value: boolean) =>
  t(
    props.family === 'metadata'
      ? ctx.key(value ? 'enabled' : 'disabled')
      : ctx.key(value ? 'yes' : 'no'),
  );
const triggerLabel = (name: string) => {
  const key = triggerLabelKey(name);
  return key === null ? name : t(key);
};
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
        v-if="
          family === 'importLists' &&
          ctx.has('suggestions') &&
          router.hasRoute('radarr-suggestions')
        "
        variant="text"
        size="small"
        :to="{ name: 'radarr-suggestions', params: { slug: ctx.slug.value } }"
        >{{ t(ctx.key('suggestions')) }}</v-btn
      >
      <v-btn
        v-if="spec.canAdd"
        color="service"
        size="small"
        :prepend-icon="msAdd"
        data-test="provider-add"
        @click="edit(null)"
        >{{ t(ctx.key('add')) }}</v-btn
      >
    </template>
    <v-card variant="flat" border>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t(ctx.key('col_name')) }}</th>
            <th>{{ t(ctx.key(family === 'indexers' ? 'col_implementation' : 'col_type')) }}</th>
            <template v-if="family === 'indexers'">
              <th>{{ t(ctx.key('col_rss')) }}</th>
              <th>{{ t(ctx.key('col_search')) }}</th>
              <th>{{ t(ctx.key('col_priority')) }}</th>
            </template>
            <template v-else-if="family === 'downloadClients'">
              <th>{{ t(ctx.key('col_host')) }}</th>
              <th>{{ t(ctx.key('col_enabled')) }}</th>
              <th>{{ t(ctx.key('col_priority')) }}</th>
            </template>
            <template v-else-if="family === 'importLists'">
              <th>{{ t(ctx.key('col_enabled')) }}</th>
              <th>{{ t(ctx.key('col_quality_profile')) }}</th>
              <th>{{ t(ctx.key('col_root_folder')) }}</th>
            </template>
            <th v-else-if="family === 'notifications'">{{ t(ctx.key('col_triggers')) }}</th>
            <th v-else>{{ t(ctx.key('col_status')) }}</th>
            <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" data-test="provider-row">
            <td class="font-weight-medium">{{ item.name ?? '—' }}</td>
            <td>
              <v-chip size="x-small" label variant="tonal">{{
                item.implementationName ?? item.implementation ?? '—'
              }}</v-chip>
            </td>
            <template v-if="family === 'indexers'">
              <td>{{ yesNo(item.enableRss === true) }}</td>
              <td>
                {{
                  yesNo(
                    item.enableAutomaticSearch === true || item.enableInteractiveSearch === true,
                  )
                }}
              </td>
              <td>{{ text(item.priority) }}</td>
            </template>
            <template v-else-if="family === 'downloadClients'">
              <td class="text-muted">
                {{ text(fieldValue(item, 'host'))
                }}<template v-if="fieldValue(item, 'port') !== undefined"
                  >:{{ text(fieldValue(item, 'port')) }}</template
                >
              </td>
              <td>{{ yesNo(enabled(item)) }}</td>
              <td>{{ text(item.priority) }}</td>
            </template>
            <template v-else-if="family === 'importLists'">
              <td>{{ yesNo(enabled(item)) }}</td>
              <td class="text-muted">{{ lists.profileName(item.qualityProfileId) }}</td>
              <td class="text-muted">{{ text(item.rootFolderPath) }}</td>
            </template>
            <td v-else-if="family === 'notifications'">
              <v-chip
                v-for="name in activeTriggers(item)"
                :key="name"
                size="x-small"
                class="me-1 mb-1"
                >{{ triggerLabel(name) }}</v-chip
              >
            </td>
            <td v-else>
              <v-chip
                size="x-small"
                :color="enabled(item) ? 'success' : undefined"
                variant="tonal"
                >{{ yesNo(enabled(item)) }}</v-chip
              >
            </td>
            <td class="text-end text-no-wrap">
              <v-btn
                v-if="family === 'metadata'"
                :icon="enabled(item) ? msCancelFill : msCheckCircleFill"
                variant="text"
                size="small"
                :aria-label="t(ctx.key(enabled(item) ? 'btn_disable' : 'btn_enable'))"
                :title="t(ctx.key(enabled(item) ? 'btn_disable' : 'btn_enable'))"
                data-test="provider-toggle"
                @click="toggle(item)"
              />
              <v-btn
                v-if="spec.labels.test !== null"
                :icon="msScience"
                variant="text"
                size="small"
                :loading="testing === item.id"
                :aria-label="t(ctx.key(spec.labels.test))"
                :title="t(ctx.key(spec.labels.test))"
                data-test="provider-row-test"
                @click="test(item)"
              />
              <v-btn
                :icon="msEdit"
                variant="text"
                size="small"
                :aria-label="t(ctx.key(spec.labels.edit))"
                :title="t(ctx.key(spec.labels.edit))"
                data-test="provider-edit"
                @click="edit(item)"
              />
              <v-btn
                :icon="msDelete"
                variant="text"
                color="error"
                size="small"
                :aria-label="t(ctx.key(spec.labels.delete))"
                :title="t(ctx.key(spec.labels.delete))"
                data-test="provider-delete"
                @click="askDelete(item)"
              />
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="8" class="text-center text-muted py-6">{{ t(ctx.key('empty')) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
    <p v-if="family === 'metadata'" class="text-body-small text-muted mt-3">
      {{ t(ctx.kindKey('footer_help')) }}
    </p>

    <ProviderDialog
      v-model="dialogOpen"
      :ctx="ctx"
      :family="spec"
      :item="editing"
      :tag-items="tags.items.value"
      :quality-profiles="lists.profileItems.value"
      :root-folders="lists.folderItems.value"
      @saved="query.refetch()"
    />
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </AdminPage>
</template>
