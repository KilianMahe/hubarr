// SPDX-License-Identifier: AGPL-3.0-or-later
// Emplacement des migrations SQL, résolu depuis ce module : `src/db/migrations` en
// développement ; dans l'image, le code est bundlé à la racine de `/app` (main.js,
// cli.js) et tsup copie les migrations dans `dist/migrations`, soit `/app/migrations`.

import { fileURLToPath } from 'node:url';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));
