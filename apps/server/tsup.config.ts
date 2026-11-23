// SPDX-License-Identifier: AGPL-3.0-or-later
// Bundle du serveur pour l'image de production. `@hubarr/shared` est
// consommé en sources TypeScript : il est donc inclus dans le
// bundle, tandis que les dépendances de production restent externes et sont
// installées par `pnpm deploy --prod`. Les migrations SQL sont copiées à côté
// (`dist/migrations`), où `db/paths.ts` les cherche.

import { cp } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts', cli: 'src/cli/main.ts', healthcheck: 'src/healthcheck.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@hubarr/shared'],
  onSuccess: async () => {
    await cp('src/db/migrations', 'dist/migrations', { recursive: true });
  },
});
