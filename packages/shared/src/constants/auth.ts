// SPDX-License-Identifier: AGPL-3.0-or-later
// Constantes d'authentification partagées par le serveur et le front.

/** Longueur minimale d'un mot de passe (assistant, profil, CLI), comme l'original. */
export const PASSWORD_MIN_LENGTH = 8;

/** Nom du cookie de session. */
export const SESSION_COOKIE_NAME = 'hubarr_session';

/** Durée de vie glissante d'une session : 7 jours d'inactivité (`gc_maxlifetime` d'origine). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** En-tête qui porte le jeton CSRF sur toutes les mutations. */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Limitation des tentatives de connexion (`login_throttling` de Symfony) :
 * 5 tentatives par couple IP + e-mail sur une fenêtre glissante de 15 minutes,
 * et 5 × 5 par IP seule (limite globale par défaut de Symfony).
 */
export const LOGIN_THROTTLE = {
  maxAttempts: 5,
  maxAttemptsPerIp: 25,
  windowMs: 15 * 60 * 1000,
} as const;
