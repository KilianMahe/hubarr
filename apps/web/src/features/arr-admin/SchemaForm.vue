<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Champs d'une ressource décrite par l'instance (`fields[]` des endpoints
// `/schema` de Radarr/Sonarr), port du rendu de `radarr/_schema_modal` :
// case à cocher, liste déroulante (simple ou multiple, catégories Newznab),
// liste libre à puces, nombre, mot de passe, URL, chemin, texte. Utilisé par
// les indexeurs, clients, listes, notifications, métadonnées et par les
// conditions des formats personnalisés et des auto-tags (P3b), puis Prowlarr
// (P3c). Les textes du schéma sont rendus en texte.
import type { ProviderField } from '@hubarr/shared';
import { computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  controlOf,
  fieldLabel,
  infoText,
  fieldVisible,
  listItem,
  numberValue,
  optionsOf,
  type FieldControl,
  type FieldOption,
} from './schema-form';

const props = defineProps<{
  fields: readonly ProviderField[];
  /** Préfixe des `data-test` (plusieurs formulaires dans un même dialogue). */
  testPrefix?: string;
}>();
const values = defineModel<Record<string, unknown>>({ required: true });
const { t } = useI18n();

interface FieldView {
  field: ProviderField;
  control: FieldControl;
  label: string;
  options: FieldOption[];
}

const views = computed<FieldView[]>(() =>
  [...props.fields]
    .filter((field) => fieldVisible(field, values.value[field.name]))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((field) => {
      const value = values.value[field.name];
      const control = controlOf(field, value);
      return {
        field,
        control,
        label: fieldLabel(field),
        options:
          control === 'select' || control === 'multiselect'
            ? optionsOf(field, value, (key) => t(`media.arr_admin.schema_modal.newznab.${key}`))
            : [],
      };
    }),
);

// Plusieurs modifications dans le même tick : le modèle ne reflète la
// précédente qu'au rendu suivant, d'où la copie en attente.
let pending: Record<string, unknown> | null = null;
function update(name: string, value: unknown): void {
  pending = { ...(pending ?? values.value), [name]: value };
  values.value = pending;
  void nextTick(() => (pending = null));
}

function textOf(name: string): string {
  const value = values.value[name];
  if (value === null || value === undefined) return '';
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
}

function listOf(name: string): (string | number)[] {
  const value = values.value[name];
  return Array.isArray(value)
    ? value.filter(
        (item): item is string | number => typeof item === 'string' || typeof item === 'number',
      )
    : [];
}

function updateList(name: string, items: unknown): void {
  const list: unknown[] = Array.isArray(items) ? (items as unknown[]) : [];
  update(
    name,
    list
      .map((item) => (typeof item === 'string' ? listItem(item) : item))
      .filter((item) => item !== ''),
  );
}

function testId(name: string): string {
  return `${props.testPrefix ?? 'schema'}-field-${name}`;
}

function hint(field: ProviderField): string | undefined {
  const parts = [field.helpText, field.helpTextWarning, field.unit ? `(${field.unit})` : null];
  const text = parts
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' ');
  return text === '' ? undefined : text;
}
</script>

<template>
  <div class="schema-form">
    <template v-for="view in views" :key="view.field.name">
      <v-checkbox
        v-if="view.control === 'checkbox'"
        :model-value="values[view.field.name] === true"
        :label="view.label"
        :hint="hint(view.field)"
        :persistent-hint="hint(view.field) !== undefined"
        color="service"
        density="compact"
        class="mb-2"
        :data-test="testId(view.field.name)"
        @update:model-value="update(view.field.name, $event === true)"
      />
      <v-select
        v-else-if="view.control === 'select'"
        :model-value="values[view.field.name]"
        :items="view.options"
        :label="view.label"
        :hint="hint(view.field)"
        persistent-hint
        variant="outlined"
        density="compact"
        class="mb-3"
        :data-test="testId(view.field.name)"
        @update:model-value="update(view.field.name, $event)"
      />
      <v-select
        v-else-if="view.control === 'multiselect'"
        :model-value="listOf(view.field.name)"
        :items="view.options"
        :label="view.label"
        :hint="hint(view.field)"
        persistent-hint
        multiple
        chips
        closable-chips
        variant="outlined"
        density="compact"
        class="mb-3"
        :data-test="testId(view.field.name)"
        @update:model-value="update(view.field.name, $event)"
      />
      <v-combobox
        v-else-if="view.control === 'list'"
        :model-value="listOf(view.field.name)"
        :label="view.label"
        :hint="hint(view.field) ?? t('media.arr_admin.schema_modal.csv_help')"
        :placeholder="t('media.arr_admin.schema_modal.csv_placeholder')"
        persistent-hint
        multiple
        chips
        closable-chips
        variant="outlined"
        density="compact"
        class="mb-3"
        :data-test="testId(view.field.name)"
        @update:model-value="updateList(view.field.name, $event)"
      />
      <v-text-field
        v-else-if="view.control === 'number'"
        :model-value="textOf(view.field.name)"
        :label="view.label"
        :hint="hint(view.field)"
        persistent-hint
        type="number"
        :step="view.field.isFloat ? 'any' : 1"
        variant="outlined"
        density="compact"
        class="mb-3"
        :data-test="testId(view.field.name)"
        @update:model-value="update(view.field.name, numberValue($event))"
      />
      <v-textarea
        v-else-if="view.control === 'textarea'"
        :model-value="textOf(view.field.name)"
        :label="view.label"
        :hint="hint(view.field)"
        persistent-hint
        rows="3"
        auto-grow
        variant="outlined"
        density="compact"
        class="mb-3"
        :data-test="testId(view.field.name)"
        @update:model-value="update(view.field.name, $event)"
      />
      <v-alert
        v-else-if="view.control === 'info'"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3 schema-form__info"
        :title="infoText(view.field, values[view.field.name]) === null ? undefined : view.label"
        :data-test="testId(view.field.name)"
        >{{ infoText(view.field, values[view.field.name]) ?? view.label }}</v-alert
      >
      <v-text-field
        v-else
        :model-value="textOf(view.field.name)"
        :label="view.label"
        :hint="hint(view.field)"
        persistent-hint
        :type="view.control === 'password' ? 'password' : view.control === 'url' ? 'url' : 'text'"
        :autocomplete="view.control === 'password' ? 'new-password' : 'off'"
        :placeholder="
          view.field.placeholder ??
          (view.control === 'path'
            ? t('media.arr_admin.schema_modal.path_placeholder')
            : view.control === 'url'
              ? 'https://…'
              : undefined)
        "
        variant="outlined"
        density="compact"
        class="mb-3"
        :data-test="testId(view.field.name)"
        @update:model-value="update(view.field.name, $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.schema-form__info {
  white-space: pre-line;
}
</style>
