<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Sections d'une configuration de l'instance (interface, nommage, gestion des
// médias, hôte), décrites dans `config-forms.ts` : cases, listes, nombres,
// textes, mots de passe (vides = inchangés), langues de l'instance.
import type { ArrKind, NamedRef } from '@hubarr/shared';
import { nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { KIND_SUFFIXED_KEYS, type ConfigField, type ConfigSection } from './config-forms';

const props = defineProps<{
  sections: readonly ConfigSection[];
  /** Service Radarr/Sonarr (libellés propres au service) ; absent pour Prowlarr. */
  kind?: ArrKind;
  languages?: readonly NamedRef[];
  /** Une section par ligne. */
  wide?: boolean;
}>();
const values = defineModel<Record<string, unknown>>({ required: true });
const { t } = useI18n();

const label = (key: string) =>
  t(props.kind !== undefined && KIND_SUFFIXED_KEYS.has(key) ? `${key}_${props.kind}` : key);
const optionalLabel = (key: string | undefined) => (key === undefined ? undefined : label(key));

function items(field: ConfigField) {
  if (field.type === 'language') {
    return (props.languages ?? []).map((language) => ({
      value: language.id,
      title: language.name,
    }));
  }
  return (field.options ?? []).map((option) => ({
    value: option.value,
    title: option.labelKey ? t(option.labelKey) : (option.title ?? String(option.value)),
  }));
}

// Plusieurs modifications dans le même tick (saisie programmée) : le modèle
// ne reflète la précédente qu'au rendu suivant, d'où la copie en attente.
let pending: Record<string, unknown> | null = null;
function set(key: string, value: unknown): void {
  pending = { ...(pending ?? values.value), [key]: value };
  values.value = pending;
  void nextTick(() => (pending = null));
}

function text(key: string): string {
  const value = values.value[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
</script>

<template>
  <v-row density="compact">
    <v-col v-for="section in sections" :key="section.id" cols="12" :md="wide ? 12 : 6">
      <v-card variant="flat" border class="h-100" :data-test="`config-section-${section.id}`">
        <v-card-title class="text-title-medium">{{ t(section.titleKey) }}</v-card-title>
        <v-card-text>
          <template v-for="field in section.fields" :key="field.key">
            <v-switch
              v-if="field.type === 'bool'"
              :model-value="values[field.key] === true"
              :label="label(field.labelKey)"
              :hint="optionalLabel(field.hintKey)"
              :persistent-hint="field.hintKey !== undefined"
              color="service"
              density="compact"
              class="mb-2"
              :data-test="`config-field-${field.key}`"
              @update:model-value="set(field.key, $event === true)"
            />
            <v-select
              v-else-if="field.type === 'select' || field.type === 'language'"
              :model-value="values[field.key]"
              :items="items(field)"
              :label="label(field.labelKey)"
              :hint="optionalLabel(field.hintKey)"
              :persistent-hint="field.hintKey !== undefined"
              variant="outlined"
              density="compact"
              class="mb-3"
              :data-test="`config-field-${field.key}`"
              @update:model-value="set(field.key, $event)"
            />
            <v-text-field
              v-else
              :model-value="text(field.key)"
              :label="label(field.labelKey)"
              :hint="optionalLabel(field.hintKey)"
              :persistent-hint="field.hintKey !== undefined"
              :placeholder="optionalLabel(field.placeholderKey)"
              :type="
                field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'
              "
              :autocomplete="field.type === 'password' ? 'new-password' : 'off'"
              variant="outlined"
              density="compact"
              class="mb-3"
              :data-test="`config-field-${field.key}`"
              @update:model-value="set(field.key, $event)"
            />
          </template>
          <slot :name="`after-${section.id}`" />
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
