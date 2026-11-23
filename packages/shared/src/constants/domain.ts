// SPDX-License-Identifier: AGPL-3.0-or-later
// Valeurs énumérées du domaine, partagées par le schéma de la base (serveur)
// et par les contrats d'API (front). PLAN §3.

/** Rôles d'un compte. L'original stockait un tableau JSON (`ROLE_ADMIN`). */
export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Types de média de la watchlist (TMDB). */
export const MEDIA_TYPES = ['movie', 'tv'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
