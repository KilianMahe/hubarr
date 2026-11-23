// SPDX-License-Identifier: AGPL-3.0-or-later
// Audit i18n côté serveur (P5.4) : les clés renvoyées au navigateur dans les
// erreurs (`message`, `reason` : `details[].message` des validations, motifs
// des 404) existent dans les catalogues. Analyse statique des sources du
// serveur et des schémas partagés.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenMessages, loadMessages } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';

const ROOTS = [
  fileURLToPath(new URL('../src', import.meta.url)),
  fileURLToPath(new URL('../../../packages/shared/src/schemas', import.meta.url)),
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith('.ts') && name !== 'openapi.ts' ? [path] : [];
  });
}

const KEY = /(?:message|reason):\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+){2,})'/g;

describe('audit des clés i18n du serveur', () => {
  it('chaque clé renvoyée dans une erreur existe', async () => {
    const en = flattenMessages(await loadMessages('en'));
    const missing = new Set<string>();
    for (const root of ROOTS) {
      for (const file of files(root)) {
        for (const match of readFileSync(file, 'utf8').matchAll(KEY)) {
          const key = match[1];
          if (key !== undefined && !en.has(key))
            missing.add(`${key} (${file.slice(root.length + 1)})`);
        }
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
