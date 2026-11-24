// SPDX-License-Identifier: AGPL-3.0-or-later
// Sortie du journal pino : chaque ligne est masquée (`redact`), puis écrite sur
// la console si elle atteint `HUBARR_LOG_LEVEL`, et gardée dans le tampon de la
// page « Journaux » si elle atteint son niveau (`HUBARR_LOG_BUFFER_LEVEL`, par
// défaut celui de la console). Le niveau du logger est le plus bavard des deux.
//
// Les lignes de suivi des requêtes de Fastify (« incoming request »,
// « request completed ») vont à la console mais pas au tampon : elles le
// rempliraient en quelques secondes au niveau `info`.

import { logLevelValue, type LogLevelName } from '@hubarr/shared';
import type { LogBuffer } from './buffer';
import { redact } from './redact';

export type ConsoleLogLevel = LogLevelName | 'silent';

export interface LogStreamOptions {
  consoleLevel: ConsoleLogLevel;
  buffer: LogBuffer;
  /** Sortie de la console (`process.stdout` par défaut). */
  output?: { write(chunk: string): unknown };
}

export interface LogStream {
  write(line: string): void;
}

const REQUEST_MESSAGES = new Set(['incoming request', 'request completed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ligne de suivi d'une requête HTTP par Fastify (pas une erreur). */
export function isRequestTrace(record: Record<string, unknown>): boolean {
  return (
    typeof record.msg === 'string' &&
    REQUEST_MESSAGES.has(record.msg) &&
    ('req' in record || 'res' in record)
  );
}

export function createLogStream(options: LogStreamOptions): LogStream {
  const output = options.output ?? process.stdout;
  const consoleMin =
    options.consoleLevel === 'silent'
      ? Number.POSITIVE_INFINITY
      : logLevelValue(options.consoleLevel);
  return {
    write(line: string): void {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = null;
      }
      if (!isRecord(parsed)) {
        // Ligne inattendue (pas du JSON pino) : console seulement, masquée.
        output.write(`${String(redact(line.trimEnd()))}\n`);
        return;
      }
      const clean = redact(parsed) as Record<string, unknown>;
      const level = typeof clean.level === 'number' ? clean.level : 30;
      if (level >= consoleMin) output.write(`${JSON.stringify(clean)}\n`);
      if (!isRequestTrace(clean)) options.buffer.push(clean);
    },
  };
}

/** Niveau du logger : le plus bavard de la console et du tampon. */
export function loggerLevel(
  consoleLevel: ConsoleLogLevel,
  bufferLevel: LogLevelName,
): LogLevelName {
  if (consoleLevel === 'silent') return bufferLevel;
  return logLevelValue(consoleLevel) <= logLevelValue(bufferLevel) ? consoleLevel : bufferLevel;
}

/** Niveau du tampon par défaut : celui de la console (`warn` si elle est muette). */
export function defaultBufferLevel(consoleLevel: ConsoleLogLevel): LogLevelName {
  return consoleLevel === 'silent' ? 'warn' : consoleLevel;
}
