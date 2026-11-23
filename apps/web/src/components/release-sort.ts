// SPDX-License-Identifier: AGPL-3.0-or-later
// Tri des colonnes de la liste des releases (`.rel-sort` d'origine) : texte
// sans casse, nombres ; un premier clic trie en ordre croissant.

import type { ArrRelease } from '@hubarr/shared';

/** État du grab d'une release dans la liste. */
export type GrabState = 'pending' | 'done' | 'failed';

export type ReleaseSortKey = 'title' | 'indexer' | 'quality' | 'score' | 'size' | 'seeders' | 'age';

function valueOf(release: ArrRelease, key: ReleaseSortKey): string | number {
  switch (key) {
    case 'title':
      return release.title.toLowerCase();
    case 'indexer':
      return release.indexer.toLowerCase();
    case 'quality':
      return release.quality.toLowerCase();
    case 'score':
      return release.customFormatScore;
    case 'size':
      return release.sizeMb;
    case 'seeders':
      return release.seeders ?? 0;
    case 'age':
      return release.age;
  }
}

export function sortReleasesBy(
  releases: readonly ArrRelease[],
  key: ReleaseSortKey,
  ascending: boolean,
): ArrRelease[] {
  const direction = ascending ? 1 : -1;
  return [...releases].sort((a, b) => {
    const left = valueOf(a, key);
    const right = valueOf(b, key);
    if (left < right) return -direction;
    if (left > right) return direction;
    return 0;
  });
}
