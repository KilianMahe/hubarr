// SPDX-License-Identifier: AGPL-3.0-or-later
// `hubarr user:reset-password <email>` (`UserResetPasswordCommand` d'origine) :
// récupération d'un compte dont le mot de passe est perdu. Saisie masquée et
// confirmée ; toutes les sessions du compte sont ensuite fermées.

import { PASSWORD_MIN_LENGTH } from '@hubarr/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { findUserByEmail } from '../modules/users/users';
import { revokeUserSessions } from '../plugins/sessions';
import { hashPassword } from '../security/password';

export interface ResetPasswordIo {
  /** Demande une valeur sans l'afficher. */
  askHidden(label: string): Promise<string>;
  info(message: string): void;
  error(message: string): void;
}

export const RESET_PASSWORD_USAGE = 'usage : hubarr user:reset-password <email>';

/** Renvoie le code de sortie : 0 en cas de succès, 1 sinon. */
export async function resetPassword(
  db: Db,
  rawEmail: string,
  io: ResetPasswordIo,
): Promise<number> {
  const email = rawEmail.trim();
  const user = email === '' ? undefined : findUserByEmail(db, email);
  if (user === undefined) {
    io.error(`Aucun compte pour « ${email} ».`);
    return 1;
  }

  io.info(`Réinitialisation du mot de passe de ${user.email}`);
  const ask = async (label: string): Promise<string | null> => {
    const value = await io.askHidden(label);
    if (value.length < PASSWORD_MIN_LENGTH) {
      io.error(`Le mot de passe doit contenir au moins ${String(PASSWORD_MIN_LENGTH)} caractères.`);
      return null;
    }
    return value;
  };

  const password = await ask('Nouveau mot de passe : ');
  if (password === null) return 1;
  const confirm = await ask('Confirmation : ');
  if (confirm === null) return 1;
  if (password !== confirm) {
    io.error('Les deux mots de passe ne correspondent pas.');
    return 1;
  }

  const passwordHash = await hashPassword(password);
  const revoked = db.transaction((tx) => {
    tx.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
    return revokeUserSessions(tx, user.id);
  });
  io.info(
    `Mot de passe réinitialisé pour ${user.email}` +
      (revoked === 0 ? '.' : ` ; ${String(revoked)} session(s) fermée(s).`),
  );
  return 0;
}
