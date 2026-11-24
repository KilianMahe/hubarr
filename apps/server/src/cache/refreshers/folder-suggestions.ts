// SPDX-License-Identifier: AGPL-3.0-or-later
// Reconstruit les suggestions par dossier racine (lot 8) dans la file de
// rafraîchissement. Possède toutes les clés `discover.folders.<langue>` ; la
// langue ne sert qu'à la clé, la reconstruction utilise la langue courante du
// client TMDB.

import {
  FOLDERS_HARD_TTL_MS,
  FOLDERS_KEY_PREFIX,
  FOLDERS_SOFT_TTL_MS,
  type FolderSuggestions,
} from '../../modules/discover/folders';
import type { CacheRefresher } from '../refresh-queue';
import type { StaleWhileRevalidateCache } from '../swr-cache';

export class FolderSuggestionsRefresher implements CacheRefresher {
  readonly name = 'folder-suggestions';

  constructor(
    private readonly folders: FolderSuggestions,
    private readonly swr: StaleWhileRevalidateCache,
  ) {}

  supports(key: string): boolean {
    return key.startsWith(FOLDERS_KEY_PREFIX);
  }

  async refresh(key: string): Promise<void> {
    // Idempotence : un doublon coûte une lecture du cache.
    if (this.swr.read(key, FOLDERS_SOFT_TTL_MS)?.state === 'fresh') return;
    // Message mis en file sous une autre langue que la langue courante.
    if (key !== this.folders.key()) return;
    const token = this.swr.fetchToken();
    const rows = await this.folders.build();
    if (rows.length === 0) return; // échec ou rien à proposer : on garde la dernière valeur
    this.swr.write(key, rows, FOLDERS_HARD_TTL_MS, { token });
  }
}
