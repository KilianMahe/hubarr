// SPDX-License-Identifier: AGPL-3.0-or-later
// Réaction commune aux erreurs d'API qui changent l'état de la session :
// 401 (session expirée ou fermée ailleurs) → connexion ; 409 `SETUP_REQUIRED`
// (installation à refaire) → assistant.

import type { Router } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { ApiError } from './client';

export function handleSessionError(error: unknown, router: Router): boolean {
  if (!(error instanceof ApiError)) return false;
  const session = useSessionStore();
  if (error.status === 401 && error.code === 'UNAUTHENTICATED') {
    session.expire();
    void router.replace({ name: 'login' });
    return true;
  }
  if (error.code === 'SETUP_REQUIRED') {
    session.requireSetup();
    void router.replace({ name: 'setup-welcome' });
    return true;
  }
  return false;
}
