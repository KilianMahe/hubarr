// SPDX-License-Identifier: AGPL-3.0-or-later
// Hachage des mots de passe en argon2id, paramètres par défaut de la
// bibliothèque (64 Mio, 3 passes).

import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/** `false` aussi pour un hash illisible : jamais d'exception sur une saisie utilisateur. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash d'un mot de passe aléatoire, vérifié quand l'e-mail est inconnu : la
 * réponse prend alors autant de temps que pour un compte existant, ce qui
 * empêche de deviner les e-mails au chronomètre.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
}
