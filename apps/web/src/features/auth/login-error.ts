// SPDX-License-Identifier: AGPL-3.0-or-later
// Message d'un échec de connexion (`security` d'origine : identifiants
// invalides, trop de tentatives, autre erreur).

import { ApiError } from '../../app/api/client';

export function loginErrorKey(failure: unknown): string {
  if (failure instanceof ApiError) {
    if (failure.code === 'INVALID_CREDENTIALS') return 'login.error.invalid';
    if (failure.code === 'LOGIN_THROTTLED') return 'login.error.throttled';
  }
  return 'login.error.generic';
}
