// SPDX-License-Identifier: AGPL-3.0-or-later
// Suivi d'une commande Radarr ou Sonarr (`pollFilmCmd`, `pollCmd` d'origine) :
// état relu toutes les 2 s jusqu'à la fin ; arrêté au démontage de la vue. Le
// suivi passera au flux SSE en P5. L'état est lu par Radarr par défaut ; les
// vues Sonarr passent `statusOf`.

import type { ArrCommandStatus } from '@hubarr/shared';
import { onScopeDispose } from 'vue';
import { commandOutcome } from './library';
import { moviesApi } from './movies-api';

export const COMMAND_POLL_MS = 2_000;
/** Au-delà, le suivi abandonne (commande perdue, instance redémarrée). */
export const COMMAND_POLL_MAX_TICKS = 900;

export interface CommandTick {
  status: ArrCommandStatus;
  /** Secondes écoulées depuis le lancement. */
  elapsed: number;
}

export type CommandResult =
  { outcome: 'completed' | 'failed'; status: ArrCommandStatus } | { outcome: 'stopped' };

export type CommandStatusReader = (slug: string, cmdId: number) => Promise<ArrCommandStatus>;

export function useArrCommand(
  options: { intervalMs?: number; statusOf?: CommandStatusReader } = {},
) {
  const intervalMs = options.intervalMs ?? COMMAND_POLL_MS;
  const statusOf = options.statusOf ?? moviesApi.commandStatus;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;
  // Accesseur : le drapeau change pendant les `await` (démontage de la vue).
  const isDisposed = () => disposed;

  onScopeDispose(() => {
    disposed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  });

  const wait = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, intervalMs);
      timers.add(timer);
    });

  /** Suit la commande jusqu'à sa fin ; `onTick` reçoit chaque état intermédiaire. */
  async function follow(
    slug: string,
    cmdId: number,
    onTick: (tick: CommandTick) => void,
  ): Promise<CommandResult> {
    for (let tick = 1; tick <= COMMAND_POLL_MAX_TICKS; tick += 1) {
      await wait();
      if (isDisposed()) return { outcome: 'stopped' };
      let status: ArrCommandStatus;
      try {
        status = await statusOf(slug, cmdId);
      } catch {
        // Erreur passagère : on réessaie au tour suivant (comme l'original).
        continue;
      }
      if (isDisposed()) return { outcome: 'stopped' };
      const outcome = commandOutcome(status.status);
      if (outcome !== 'running') return { outcome, status };
      onTick({ status, elapsed: (tick * intervalMs) / 1000 });
    }
    return { outcome: 'stopped' };
  }

  return { follow };
}
