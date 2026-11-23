// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Sous `make check`, les suites serveur et front tournent en parallèle :
    // les tests à plusieurs connexions (argon2id ~100 ms chacune) dépassaient
    // les 5 s par défaut alors qu'ils prennent ~1 s seuls (P5b.3).
    testTimeout: 20_000,
  },
});
