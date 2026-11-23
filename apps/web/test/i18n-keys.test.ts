// SPDX-License-Identifier: AGPL-3.0-or-later
// Audit i18n (P5.4) : chaque clé littérale utilisée par le front existe dans
// les catalogues (FR et EN, dont la parité est vérifiée par le paquet
// partagé) ; chaque clé construite (`t(\`a.b.${x}\`)`) a au moins une clé sous
// son préfixe. Analyse statique des sources.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { flattenMessages, loadMessages } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';

// Environnement jsdom : `import.meta.url` n'y est pas une URL de fichier.
const ROOT = join(process.cwd(), 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(vue|ts)$/.test(name) ? [path] : [];
  });
}

/** Appels `t('clé')`, `t("clé")`, `$t('clé')`, `tc(…)` et propriétés `…Key: 'clé'`. */
const LITERAL = [
  /(?<![\w.])\$?t[ce]?\(\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'(?!\s*\+)/g,
  /(?<![\w.])\$?t[ce]?\(\s*"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"/g,
  /\b\w*[kK]ey:\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'/g,
  /(?:success|error|info)\(\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'/g,
];
/** Préfixe des clés construites : `t(\`a.b.${…}\`)`. */
const TEMPLATE = /(?<![\w.])\$?t\(\s*`([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.)\$\{/g;
/** Préfixe des clés concaténées : `t('a.b.c_' + x)`. */
const CONCAT = /(?<![\w.])\$?t\(\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'\s*\+/g;

describe('audit des clés i18n', () => {
  it('aucune clé manquante (littérales et préfixes des clés construites)', async () => {
    const en = flattenMessages(await loadMessages('en'));
    const keys = [...en.keys()];
    const missing = new Set<string>();
    const prefixes = new Set<string>();
    for (const file of files(ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of LITERAL) {
        for (const match of source.matchAll(pattern)) {
          const key = match[1];
          // Clé de catalogue (au moins deux segments) absente : manquante.
          if (key !== undefined && !en.has(key) && !keys.some((k) => k.startsWith(`${key}.`))) {
            missing.add(`${key} (${file.slice(ROOT.length + 1)})`);
          }
        }
      }
      for (const pattern of [TEMPLATE, CONCAT]) {
        for (const match of source.matchAll(pattern)) {
          if (match[1] !== undefined) prefixes.add(match[1]);
        }
      }
    }
    expect([...missing].sort()).toEqual([]);
    const orphanPrefixes = [...prefixes].filter(
      (prefix) => !keys.some((k) => k.startsWith(prefix)),
    );
    expect(orphanPrefixes.sort()).toEqual([]);
  });
});
