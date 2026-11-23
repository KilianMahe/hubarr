// SPDX-License-Identifier: AGPL-3.0-or-later
// Configuration de drizzle-kit : `make db-generate` compare `src/db/schema.ts` au
// dernier instantané et écrit la migration SQL suivante dans `src/db/migrations`.

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
