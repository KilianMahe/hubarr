<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Conditions d'un format personnalisé ou d'une règle d'auto-tagging (port des
// « spec cards » de `radarr/custom_formats.html.twig`) : type choisi parmi les
// modèles de l'instance (`…/schema`), nom (pré-rempli avec le type), inverser,
// requis, champs du modèle rendus par `SchemaForm`. Les auto-tags en
// profitent aussi (l'original y demandait un JSON brut).
import type { Specification } from '@hubarr/shared';
import { msAdd, msClose } from '../../components/symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SchemaForm from './SchemaForm.vue';
import { templateLabel } from './schema-form';
import type { SpecificationDraft } from './specifications';

const props = defineProps<{
  templates: readonly Specification[];
  /** Clés i18n : `condition_tpl`, `condition_type`, `negate`, `required`… */
  labels: {
    title: string;
    add: string;
    empty: string;
    condition: (index: number) => string;
    type: string;
    typePlaceholder: string;
    name: string;
    namePlaceholder: string;
    negate: string;
    required: string;
  };
}>();
const drafts = defineModel<SpecificationDraft[]>({ required: true });
const { t } = useI18n();

const typeItems = computed(() =>
  props.templates.map((template, index) => ({ value: index, title: templateLabel(template) })),
);

let counter = 0;
function add(): void {
  drafts.value = [
    ...drafts.value,
    {
      key: `new-${counter++}`,
      templateIndex: null,
      name: '',
      negate: false,
      required: false,
      values: {},
    },
  ];
}

function remove(key: string): void {
  drafts.value = drafts.value.filter((draft) => draft.key !== key);
}

function selectType(draft: SpecificationDraft, index: number | null): void {
  draft.templateIndex = index;
  const template = index === null ? undefined : props.templates[index];
  if (template && draft.name.trim() === '') draft.name = templateLabel(template);
  draft.values = Object.fromEntries(
    (template?.fields ?? []).map((field) => [field.name, field.value ?? null]),
  );
}
</script>

<template>
  <div class="specifications">
    <div class="d-flex align-center mb-2">
      <h3 class="text-title-small">{{ labels.title }}</h3>
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        color="service-text"
        :prepend-icon="msAdd"
        data-test="spec-add"
        @click="add"
        >{{ labels.add }}</v-btn
      >
    </div>
    <p v-if="drafts.length === 0" class="text-body-small text-muted">{{ labels.empty }}</p>
    <v-card
      v-for="(draft, index) in drafts"
      :key="draft.key"
      variant="outlined"
      class="mb-3"
      data-test="spec-card"
    >
      <v-card-title class="d-flex align-center text-title-small py-2">
        {{ labels.condition(index + 1) }}
        <v-spacer />
        <v-btn
          :icon="msClose"
          variant="text"
          size="small"
          color="error"
          :aria-label="t('common.action.delete')"
          data-test="spec-remove"
          @click="remove(draft.key)"
        />
      </v-card-title>
      <v-card-text>
        <v-row density="compact">
          <v-col cols="12" sm="6">
            <v-select
              :model-value="draft.templateIndex"
              :items="typeItems"
              :label="labels.type"
              :placeholder="labels.typePlaceholder"
              variant="outlined"
              density="compact"
              data-test="spec-type"
              @update:model-value="selectType(draft, $event)"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="draft.name"
              :label="labels.name"
              :placeholder="labels.namePlaceholder"
              variant="outlined"
              density="compact"
              data-test="spec-name"
            />
          </v-col>
        </v-row>
        <div class="d-flex ga-4 mb-2">
          <v-checkbox
            v-model="draft.negate"
            :label="labels.negate"
            color="service"
            density="compact"
            hide-details
          />
          <v-checkbox
            v-model="draft.required"
            :label="labels.required"
            color="service"
            density="compact"
            hide-details
          />
        </div>
        <SchemaForm
          v-if="draft.templateIndex !== null && templates[draft.templateIndex]"
          v-model="draft.values"
          :fields="templates[draft.templateIndex]?.fields ?? []"
          :test-prefix="`spec-${index}`"
        />
      </v-card-text>
    </v-card>
  </div>
</template>
