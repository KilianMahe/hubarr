// SPDX-License-Identifier: AGPL-3.0-or-later
// Rangées « Recommandations » et « Similaires » de la fiche d'un titre :
// sans le titre lui-même, sans doublon (un titre recommandé n'est pas répété
// dans les similaires), 20 cartes au plus par rangée. Fonction pure, testée.

import type { TmdbCard, TmdbSuggestions } from '@hubarr/shared';

export const SUGGESTIONS_PER_ROW = 20;

export function suggestionRows(
  recommendations: readonly TmdbCard[],
  similar: readonly TmdbCard[],
  selfId: number,
): TmdbSuggestions {
  const seen = new Set<number>([selfId]);
  const keep = (cards: readonly TmdbCard[]) => {
    const out: TmdbCard[] = [];
    for (const card of cards) {
      if (out.length >= SUGGESTIONS_PER_ROW) break;
      if (card.id <= 0 || seen.has(card.id)) continue;
      seen.add(card.id);
      out.push(card);
    }
    return out;
  };
  // Ordre d'évaluation : les recommandations d'abord, prioritaires.
  return { recommendations: keep(recommendations), similar: keep(similar) };
}
