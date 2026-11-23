// SPDX-License-Identifier: AGPL-3.0-or-later
// Reconstruit le vocabulaire de recherche dans la file de rafraîchissement :
// port de `SearchVocabularyRefresher`. Possède toutes les clés
// `tmdb.search_vocab.<langue>` ; la langue ne sert qu'à la clé, la
// reconstruction utilise la langue courante du client TMDB.

import {
  VOCABULARY_HARD_TTL_MS,
  VOCABULARY_KEY_PREFIX,
  VOCABULARY_SOFT_TTL_MS,
  type SearchVocabulary,
} from '../../modules/search/vocabulary';
import type { CacheRefresher } from '../refresh-queue';
import type { StaleWhileRevalidateCache } from '../swr-cache';

export class SearchVocabularyRefresher implements CacheRefresher {
  readonly name = 'search-vocabulary';

  constructor(
    private readonly vocabulary: SearchVocabulary,
    private readonly swr: StaleWhileRevalidateCache,
  ) {}

  supports(key: string): boolean {
    return key.startsWith(VOCABULARY_KEY_PREFIX);
  }

  async refresh(key: string): Promise<void> {
    // Idempotence : un doublon coûte une lecture du cache.
    if (this.swr.read(key, VOCABULARY_SOFT_TTL_MS)?.state === 'fresh') return;
    // Message mis en file sous une autre langue que la langue courante.
    if (key !== this.vocabulary.key()) return;
    const words = await this.vocabulary.build();
    if (words.length === 0) return; // échec : on garde la dernière bonne valeur
    this.swr.write(key, words, VOCABULARY_HARD_TTL_MS);
  }
}
