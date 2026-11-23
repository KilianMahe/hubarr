// SPDX-License-Identifier: AGPL-3.0-or-later
// CLI d'administration (`hubarr <commande>`). Commandes :
//   db:migrate                    applique les migrations en attente (le serveur le fait aussi au démarrage)
//   user:reset-password <email>   réinitialise le mot de passe d'un compte (saisie masquée)

import { loadEnv } from '../config/env';
import { prepareDatabase } from '../db/migrate';
import { MIGRATIONS_FOLDER } from '../db/paths';
import { createPrompter } from './prompt';
import { RESET_PASSWORD_USAGE, resetPassword } from './reset-password';

async function openDatabase() {
  const env = loadEnv();
  return prepareDatabase({ dataDir: env.HUBARR_DATA_DIR, migrationsFolder: MIGRATIONS_FOLDER });
}

async function dbMigrate(): Promise<number> {
  const { database, report } = await openDatabase();
  database.close();
  console.log(
    report.applied === 0
      ? 'base à jour, aucune migration en attente'
      : `${String(report.applied)} migration(s) appliquée(s)` +
          (report.backupFile === null ? '' : `, sauvegarde : ${report.backupFile}`),
  );
  return 0;
}

async function userResetPassword(args: string[]): Promise<number> {
  const [email] = args;
  if (email === undefined || args.length !== 1) {
    console.error(RESET_PASSWORD_USAGE);
    return 2;
  }
  const { database } = await openDatabase();
  const prompter = createPrompter();
  try {
    return await resetPassword(database.db, email, {
      askHidden: (label) => prompter.askHidden(label),
      info: (message) => {
        console.log(message);
      },
      error: (message) => {
        console.error(message);
      },
    });
  } finally {
    prompter.close();
    database.close();
  }
}

const commands: Record<string, (args: string[]) => Promise<number>> = {
  'db:migrate': dbMigrate,
  'user:reset-password': userResetPassword,
};

const [name, ...args] = process.argv.slice(2);
const command = name === undefined ? undefined : commands[name];
if (command === undefined) {
  console.error(`usage : hubarr <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
try {
  process.exitCode = await command(args);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
