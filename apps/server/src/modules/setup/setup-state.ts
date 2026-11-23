// SPDX-License-Identifier: AGPL-3.0-or-later
// État de l'installation (`setup_completed`), lu par la garde, l'assistant et
// `/api/bootstrap`. Une installation terminée ne revient jamais en arrière :
// seul l'état « terminé » est mémorisé, l'état « à faire » est relu à chaque
// fois (une requête par clé primaire), ce qui évite le `reset()` par requête du
// `SetupRedirectSubscriber` d'origine.

import type { Db, DbExecutor } from '../../db/client';
import { SETTING_KEYS, getSetting, setSetting } from '../settings/settings';
import { countUsers } from '../users/users';

export class SetupState {
  private completed = false;

  constructor(private readonly db: Db) {}

  isCompleted(): boolean {
    if (!this.completed) this.completed = getSetting(this.db, SETTING_KEYS.setupCompleted) === true;
    return this.completed;
  }

  hasUsers(): boolean {
    return countUsers(this.db) > 0;
  }

  /** Écrit le drapeau ; à appeler dans la transaction qui crée l'admin, le cas échéant. */
  markCompleted(db: DbExecutor = this.db): void {
    setSetting(db, SETTING_KEYS.setupCompleted, true);
  }

  /** Mémorise l'état « terminé » une fois la transaction validée. */
  remember(): void {
    this.completed = true;
  }
}
