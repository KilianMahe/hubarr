// SPDX-License-Identifier: AGPL-3.0-or-later
// Réaction commune aux erreurs d'API qui changent l'état de la session :
// 401 (session expirée ou fermée ailleurs) → connexion ; 409 `SETUP_REQUIRED`
// (installation à refaire) → assistant ; 403 `FORBIDDEN` → droits relus
// (un admin a pu les changer), au plus une fois par intervalle.

import type { Router } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { ApiError } from './client';

/** Intervalle minimal entre deux relectures des droits après un refus. */
const FORBIDDEN_REFRESH_MS = 10_000;
let lastForbiddenRefresh = 0;

export function handleSessionError(error: unknown, router: Router): boolean {
  if (!(error instanceof ApiError)) return false;
  const session = useSessionStore();
  if (error.status === 401 && error.code === 'UNAUTHENTICATED') {
    session.expire();
    void router.replace({ name: 'login' });
    return true;
  }
  if (error.status === 403 && error.code === 'FORBIDDEN') {
    const now = Date.now();
    if (now - lastForbiddenRefresh >= FORBIDDEN_REFRESH_MS) {
      lastForbiddenRefresh = now;
      void session.refreshServices();
    }
    return false;
  }
  if (error.code === 'SETUP_REQUIRED') {
    session.requireSetup();
    void router.replace({ name: 'setup-welcome' });
    return true;
  }
  return false;
}
