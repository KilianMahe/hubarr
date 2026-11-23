<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Qualité (`radarr/quality.html.twig`) : profils de qualité (liste, ajout,
// modification, suppression) et définitions de qualité (titre, tailles
// minimum, préférée et maximum en Gio/h, enregistrées ensemble).
//
// Éditeur de profil : nom, mise à niveau, langue (Radarr), scores des formats
// personnalisés, qualités cochées et ordonnées (glisser-déposer ou flèches),
// seuil parmi les qualités cochées. Écart : les bornes des tailles viennent de
// `limits.max` (l'original lisait une clé absente et plafonnait à 400).
import {
  qualityPageSchema,
  qualityProfileSchema,
  type QualityDefinition,
  type QualityProfile,
} from '@hubarr/shared';
import { mdiArrowDown, mdiArrowUp, mdiDelete, mdiDragVertical, mdiPencil, mdiPlus } from '@mdi/js';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import AdminDialog from '../AdminDialog.vue';
import AdminPage from '../AdminPage.vue';
import { useAdminPage, useConfirmAction } from '../admin-api';
import {
  allowedQualities,
  clampSizes,
  cutoffLabel,
  cutoffOptions,
  editorItems,
  fromGiBPerHour,
  groupQualities,
  moveItem,
  profileForm,
  profilePayload,
  qualityItemLabel,
  sizeForMinutes,
  toGiBPerHour,
  toNumber,
  type EditableQualityItem,
  type QualityProfileForm,
} from '../admin-format';

const { t } = useI18n();
const { ctx, query, feedback, error, title, run } = useAdminPage(
  'quality',
  '/qualite',
  qualityPageSchema,
);
const confirm = useConfirmAction();
const page = computed(() => query.data.value);
const withLanguage = computed(() => ctx.has('profileLanguage'));

// ── Profils ─────────────────────────────────────────────────────────────────

const open = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const editing = ref<QualityProfile | null>(null);
const form = reactive<QualityProfileForm>(profileForm(null, false));
const items = ref<EditableQualityItem[]>([]);
const cutoffs = computed(() => cutoffOptions(items.value));
watch(cutoffs, (options) => {
  if (form.cutoff !== null && !options.some((option) => option.value === form.cutoff)) {
    form.cutoff = null;
  }
});

function edit(profile: QualityProfile | null): void {
  const data = page.value;
  if (!data) return;
  editing.value = profile;
  formError.value = null;
  Object.assign(form, profileForm(profile, withLanguage.value));
  items.value = editorItems(profile, data.profiles, data.definitions);
  open.value = true;
}

function move(from: number, to: number): void {
  items.value = moveItem(items.value, from, to);
}

let dragFrom: number | null = null;
function onDrop(to: number): void {
  if (dragFrom !== null) move(dragFrom, to);
  dragFrom = null;
}

async function save(): Promise<void> {
  const data = page.value;
  if (!data) return;
  if (form.name.trim() === '') {
    formError.value = t(ctx.key('error_name_required'));
    return;
  }
  saving.value = true;
  formError.value = null;
  const payload = profilePayload(
    form,
    items.value,
    data.customFormats,
    data.languages,
    editing.value,
  );
  try {
    const id = editing.value?.id;
    if (id === undefined) await ctx.post('/qualite/profils/ajouter', payload, qualityProfileSchema);
    else await ctx.post(`/qualite/profils/${id}/modifier`, payload, qualityProfileSchema);
    open.value = false;
    await query.refetch();
  } catch (failure) {
    formError.value = ctx.errorMessage(failure, ctx.key('error_save_profile'));
  } finally {
    saving.value = false;
  }
}

function askDelete(profile: QualityProfile): void {
  if (profile.id === undefined) return;
  const id = profile.id;
  open.value = false;
  confirm.ask(t(ctx.key('confirm_delete_tpl'), { name: profile.name ?? '' }), () =>
    run(() => ctx.post(`/qualite/profils/${id}/supprimer`), ctx.key('error_delete')),
  );
}

// ── Définitions ─────────────────────────────────────────────────────────────

interface DefinitionRow {
  definition: QualityDefinition;
  title: string;
  /** Gio/h, arrondis à 0,1 pour la saisie. */
  min: number;
  preferred: number;
  max: number;
}

const limit = computed(() => page.value?.limits?.max ?? 400);
const rows = ref<DefinitionRow[]>([]);
const round = (value: number) => Math.round(toGiBPerHour(value) * 10) / 10;
watch(
  () => page.value?.definitions,
  (definitions) => {
    rows.value = (definitions ?? []).map((definition) => ({
      definition,
      title: definition.title ?? definition.quality?.name ?? '',
      min: round(definition.minSize ?? 0),
      preferred: round(definition.preferredSize ?? definition.maxSize ?? limit.value),
      max: round(definition.maxSize ?? limit.value),
    }));
  },
  { immediate: true },
);

const savingDefinitions = ref(false);
async function saveDefinitions(): Promise<void> {
  savingDefinitions.value = true;
  const payload = rows.value.map((row) => ({
    ...row.definition,
    title: row.title,
    ...clampSizes(
      fromGiBPerHour(toNumber(row.min)),
      fromGiBPerHour(toNumber(row.preferred)),
      fromGiBPerHour(toNumber(row.max)),
      limit.value,
    ),
  }));
  await run(
    () => ctx.post('/qualite/definitions/sauvegarder', payload),
    ctx.key('error_save_def'),
    t('admin.flash.saved'),
  );
  savingDefinitions.value = false;
}

function sizeHint(row: DefinitionRow, which: 'min' | 'preferred' | 'max'): string {
  const rate = fromGiBPerHour(toNumber(row[which]));
  const label = t(
    ctx.key(
      which === 'min'
        ? 'size_min_tooltip'
        : which === 'max'
          ? 'size_max_tooltip'
          : 'size_pref_tooltip',
    ),
  );
  return `${label} — 60 min : ${sizeForMinutes(rate, 60)} · 90 min : ${sizeForMinutes(rate, 90)} · 120 min : ${sizeForMinutes(rate, 120)}`;
}
const maxGiB = computed(() => Math.ceil(toGiBPerHour(limit.value)));
</script>

<template>
  <AdminPage
    v-model:feedback="feedback"
    :kind="ctx.kind.value"
    :slug="ctx.slug.value"
    :title="title"
    :loading="query.isPending.value"
    :error="error"
  >
    <template v-if="page">
      <v-card variant="flat" border class="mb-4">
        <v-card-title class="d-flex align-center ga-2 text-title-medium">
          {{ t(ctx.key('profiles_section')) }}
          <v-chip size="x-small" variant="tonal">{{
            t(ctx.key('profiles_count_tpl'), { count: page.profiles.length })
          }}</v-chip>
          <v-spacer />
          <v-btn
            color="service"
            size="small"
            :prepend-icon="mdiPlus"
            data-test="quality-profile-add"
            @click="edit(null)"
            >{{ t(ctx.key('add')) }}</v-btn
          >
        </v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ t(ctx.key('col_name')) }}</th>
              <th>{{ t(ctx.key('col_cutoff')) }}</th>
              <th>{{ t(ctx.key('col_qualities')) }}</th>
              <th class="text-end">{{ t(ctx.key('col_actions')) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="profile in page.profiles" :key="profile.id" data-test="quality-profile-row">
              <td class="font-weight-medium">{{ profile.name }}</td>
              <td>
                <v-chip size="x-small" label color="info" variant="tonal">{{
                  cutoffLabel(profile)
                }}</v-chip>
              </td>
              <td>
                <v-chip
                  v-for="name in allowedQualities(profile)"
                  :key="name"
                  size="x-small"
                  class="me-1 mb-1"
                  >{{ name }}</v-chip
                >
              </td>
              <td class="text-end text-no-wrap">
                <v-btn
                  :icon="mdiPencil"
                  variant="text"
                  size="small"
                  :aria-label="t(ctx.key('edit'))"
                  :title="t(ctx.key('edit'))"
                  data-test="quality-profile-edit"
                  @click="edit(profile)"
                />
                <v-btn
                  :icon="mdiDelete"
                  variant="text"
                  color="error"
                  size="small"
                  :aria-label="t(ctx.key('delete'))"
                  :title="t(ctx.key('delete'))"
                  data-test="quality-profile-delete"
                  @click="askDelete(profile)"
                />
              </td>
            </tr>
            <tr v-if="page.profiles.length === 0">
              <td colspan="4" class="text-center text-muted py-6">
                {{ t(ctx.key('empty_profiles')) }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card variant="flat" border>
        <v-card-title class="d-flex align-center ga-2 text-title-medium">
          {{ t(ctx.key('definitions_section')) }}
          <v-chip size="x-small" variant="tonal">{{
            t(ctx.key('definitions_count_tpl'), { count: rows.length })
          }}</v-chip>
          <v-spacer />
          <v-btn
            color="service"
            size="small"
            :loading="savingDefinitions"
            :disabled="rows.length === 0"
            data-test="quality-definitions-save"
            @click="saveDefinitions"
            >{{ t(ctx.key('save')) }}</v-btn
          >
        </v-card-title>
        <v-card-text v-if="rows.length === 0" class="text-center text-muted">{{
          t(ctx.key('empty_definitions'))
        }}</v-card-text>
        <v-list v-else density="compact">
          <v-list-item
            v-for="row in rows"
            :key="row.definition.id"
            data-test="quality-definition-row"
          >
            <v-row density="compact" align="center">
              <v-col cols="12" md="2" class="font-weight-medium">{{
                row.definition.quality?.name ?? row.title
              }}</v-col>
              <v-col cols="12" md="3">
                <v-text-field
                  v-model="row.title"
                  :label="t(ctx.key('def_title'))"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="12" md="7">
                <v-range-slider
                  :model-value="[row.min, row.max]"
                  :min="0"
                  :max="maxGiB"
                  :step="0.1"
                  color="service"
                  hide-details
                  density="compact"
                  :aria-label="t(ctx.key('def_values'))"
                  @update:model-value="
                    ([min, max]) => {
                      row.min = min ?? 0;
                      row.max = max ?? 0;
                      row.preferred = Math.min(Math.max(row.preferred, row.min), row.max);
                    }
                  "
                />
                <div class="d-flex ga-2">
                  <v-text-field
                    v-model.number="row.min"
                    type="number"
                    step="0.1"
                    :label="t(ctx.key('size_min_tooltip'))"
                    :title="sizeHint(row, 'min')"
                    suffix="GiB/h"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                  <v-text-field
                    v-model.number="row.preferred"
                    type="number"
                    step="0.1"
                    :label="t(ctx.key('size_pref_tooltip'))"
                    :title="sizeHint(row, 'preferred')"
                    suffix="GiB/h"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                  <v-text-field
                    v-model.number="row.max"
                    type="number"
                    step="0.1"
                    :label="t(ctx.key('size_max_tooltip'))"
                    :title="sizeHint(row, 'max')"
                    suffix="GiB/h"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </div>
              </v-col>
            </v-row>
          </v-list-item>
        </v-list>
      </v-card>
    </template>

    <AdminDialog
      v-model="open"
      :title="t(ctx.key(editing ? 'modal_edit' : 'modal_new'))"
      :error="formError"
      :saving="saving"
      :save-label="t(ctx.key('save_modal'))"
      :max-width="820"
      @save="save"
    >
      <template v-if="editing" #extra>
        <v-btn color="error" variant="text" :prepend-icon="mdiDelete" @click="askDelete(editing)">{{
          t(ctx.key('delete'))
        }}</v-btn>
      </template>
      <v-text-field
        v-model="form.name"
        :label="t(ctx.key('name_label'))"
        :placeholder="t(ctx.key('name_placeholder'))"
        variant="outlined"
        density="compact"
        data-test="quality-profile-name"
      />
      <v-switch
        v-model="form.upgradeAllowed"
        :label="t(ctx.key('upgrade_allowed'))"
        color="service"
        density="compact"
        hide-details
        class="mb-2"
      />
      <v-row density="compact">
        <v-col v-if="form.languageId !== null" cols="12" sm="4">
          <v-select
            v-model="form.languageId"
            :items="page?.languages ?? []"
            item-title="name"
            item-value="id"
            :label="t(ctx.key('language'))"
            variant="outlined"
            density="compact"
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="form.minFormatScore"
            type="number"
            :label="t(ctx.key('min_format_score'))"
            variant="outlined"
            density="compact"
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="form.cutoffFormatScore"
            type="number"
            :label="t(ctx.key('cutoff_format_score'))"
            variant="outlined"
            density="compact"
          />
        </v-col>
      </v-row>

      <template v-if="(page?.customFormats ?? []).length > 0">
        <h3 class="text-title-small mb-1">{{ t(ctx.key('custom_formats_subsection')) }}</h3>
        <p class="text-body-small text-muted mb-2">{{ t(ctx.key('custom_formats_help')) }}</p>
        <div class="quality-formats mb-4">
          <div
            v-for="format in page?.customFormats ?? []"
            :key="format.id"
            class="d-flex align-center ga-2"
          >
            <span class="flex-grow-1 text-body-medium">{{ format.name }}</span>
            <v-text-field
              :model-value="form.scores[format.id] ?? 0"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 110px"
              :aria-label="format.name"
              @update:model-value="form.scores[format.id] = toNumber($event)"
            />
          </div>
        </div>
      </template>

      <h3 class="text-title-small mb-1">{{ t(ctx.key('qualities_subsection')) }}</h3>
      <p class="text-body-small text-muted mb-2">{{ t(ctx.key('qualities_help')) }}</p>
      <v-list density="compact" border rounded class="mb-4" data-test="quality-profile-items">
        <v-list-item
          v-for="(entry, index) in items"
          :key="entry.key"
          draggable="true"
          class="quality-item"
          data-test="quality-profile-item"
          @dragstart="dragFrom = index"
          @dragover.prevent
          @drop.prevent="onDrop(index)"
        >
          <template #prepend>
            <v-icon
              :icon="mdiDragVertical"
              size="small"
              class="me-1 text-muted"
              :title="t(ctx.key('drag_reorder'))"
            />
            <v-checkbox-btn
              v-model="entry.allowed"
              color="service"
              density="compact"
              :aria-label="qualityItemLabel(entry.item)"
            />
          </template>
          <v-list-item-title class="d-flex flex-wrap align-center ga-1">
            <span>{{ qualityItemLabel(entry.item) }}</span>
            <v-chip
              v-for="sub in groupQualities(entry.item)"
              :key="sub"
              size="x-small"
              color="info"
              variant="tonal"
              >{{ sub }}</v-chip
            >
          </v-list-item-title>
          <template #append>
            <v-btn
              :icon="mdiArrowUp"
              variant="text"
              size="x-small"
              :disabled="index === 0"
              :aria-label="t('common.action.previous')"
              @click="move(index, index - 1)"
            />
            <v-btn
              :icon="mdiArrowDown"
              variant="text"
              size="x-small"
              :disabled="index === items.length - 1"
              :aria-label="t('common.action.next')"
              @click="move(index, index + 1)"
            />
          </template>
        </v-list-item>
      </v-list>
      <v-select
        v-model="form.cutoff"
        :items="cutoffs"
        :label="t(ctx.key('cutoff_label'))"
        :placeholder="t(ctx.key('cutoff_placeholder'))"
        :hint="t(ctx.kindKey('cutoff_help'))"
        persistent-hint
        variant="outlined"
        density="compact"
        data-test="quality-profile-cutoff"
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

<style scoped>
.quality-formats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 4px 16px;
}
.quality-item {
  cursor: grab;
}
</style>
