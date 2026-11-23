// SPDX-License-Identifier: AGPL-3.0-or-later
// Conditions des formats personnalisés et des règles d'auto-tagging : brouillons
// de l'éditeur (`SpecificationsEditor.vue`) et conditions à envoyer (port de
// `createSpecCard` et `collectSpecs` de `radarr/custom_formats.html.twig`).

import type { Specification } from '@hubarr/shared';
import { fieldsPayload, initialValues, templateLabel } from './schema-form';

export interface SpecificationDraft {
  key: string;
  /** Modèle choisi (index dans les modèles de l'instance), `null` tant qu'aucun. */
  templateIndex: number | null;
  name: string;
  negate: boolean;
  required: boolean;
  values: Record<string, unknown>;
}

/** Brouillons des conditions existantes (modèle retrouvé par son implémentation). */
export function specificationDrafts(
  specifications: readonly Specification[],
  templates: readonly Specification[],
): SpecificationDraft[] {
  return specifications.map((specification, index) => {
    const templateIndex = templates.findIndex(
      (template) => template.implementation === specification.implementation,
    );
    const template = templates[templateIndex];
    return {
      key: `spec-${index}`,
      templateIndex: templateIndex >= 0 ? templateIndex : null,
      name: specification.name ?? '',
      negate: specification.negate ?? false,
      required: specification.required ?? false,
      values: template ? initialValues(template, specification) : {},
    };
  });
}

/**
 * Conditions à envoyer : brouillons dont le type est choisi ; nom vide → nom du
 * type ; tous les champs du modèle (cachés compris).
 */
export function specificationsPayload(
  drafts: readonly SpecificationDraft[],
  templates: readonly Specification[],
): Specification[] {
  return drafts.flatMap((draft) => {
    const template = draft.templateIndex === null ? undefined : templates[draft.templateIndex];
    if (!template) return [];
    return [
      {
        name: draft.name.trim() === '' ? templateLabel(template) : draft.name.trim(),
        implementation: template.implementation ?? null,
        implementationName: template.implementationName ?? template.implementation ?? null,
        ...(typeof template.infoLink === 'string' ? { infoLink: template.infoLink } : {}),
        negate: draft.negate,
        required: draft.required,
        fields: fieldsPayload(template, draft.values),
      },
    ];
  });
}
