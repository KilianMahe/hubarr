// SPDX-License-Identifier: AGPL-3.0-or-later
// Journaux : masquage des secrets, tampon circulaire, sortie pino (console et tampon).

import { describe, expect, it } from 'vitest';
import {
  LogBuffer,
  REDACTED,
  createLogStream,
  defaultBufferLevel,
  loggerLevel,
  redact,
  redactString,
} from '../../src/logs';

describe('redact', () => {
  it('masque les champs sensibles à toute profondeur, garde les booléens', () => {
    expect(
      redact({
        apiKey: 'k1',
        nested: { api_key: 'k2', headers: { authorization: 'Basic eDp5', cookie: 'sid=1' } },
        list: [{ password: 'p' }, { token: 't' }],
        hasApiKey: true,
        X_Plex_Token: 'x',
        clientSecret: 's',
        title: 'Dune',
      }),
    ).toEqual({
      apiKey: REDACTED,
      nested: { api_key: REDACTED, headers: { authorization: REDACTED, cookie: REDACTED } },
      list: [{ password: REDACTED }, { token: REDACTED }],
      hasApiKey: true,
      X_Plex_Token: REDACTED,
      clientSecret: REDACTED,
      title: 'Dune',
    });
  });

  it('masque les secrets dans le texte : paramètres d’URL, identifiants, en-têtes, paires', () => {
    expect(redactString('GET http://sab:8080/api?mode=queue&apikey=abc123&output=json')).toBe(
      `GET http://sab:8080/api?mode=queue&apikey=${REDACTED}&output=json`,
    );
    expect(redactString('https://user:hunter2@host/x?token=zz')).toBe(
      `https://${REDACTED}@host/x?token=${REDACTED}`,
    );
    expect(redactString('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.x.y')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
    expect(redactString('{"apiKey": "abc", "name": "radarr"}')).toBe(
      `{"apiKey": "${REDACTED}", "name": "radarr"}`,
    );
    expect(redactString('password=hunter2&user=bob')).toBe(`password="${REDACTED}"&user=bob`);
    expect(redactString('magnet:?xt=urn:btih:ABCDEF&dn=x')).toBe('[magnet]');
  });

  it('tronque les textes très longs', () => {
    expect(redactString('a'.repeat(5_000))).toHaveLength(4_001);
  });
});

describe('LogBuffer', () => {
  const record = (level: number, msg: string, extra: Record<string, unknown> = {}) => ({
    level,
    time: Date.UTC(2026, 10, 23, 12),
    pid: 1,
    hostname: 'h',
    msg,
    ...extra,
  });

  it('écarte les entrées sous son niveau et les plus anciennes au-delà de sa capacité', () => {
    const buffer = new LogBuffer({ capacity: 3, level: 'warn' });
    buffer.push(record(30, 'info ignorée'));
    for (const index of [1, 2, 3, 4]) buffer.push(record(40, `w${String(index)}`));
    expect(buffer.size).toBe(3);
    expect(buffer.filter({}).map((entry) => entry.msg)).toEqual(['w4', 'w3', 'w2']);
  });

  it('forme une entrée : niveau nommé, service à part, contexte sans pid ni hostname', () => {
    const buffer = new LogBuffer({ level: 'info' });
    buffer.push(record(50, 'boom', { service: 'radarr', instance: 'r1', status: 500 }));
    expect(buffer.filter({})).toEqual([
      {
        id: 1,
        time: '2026-11-23T12:00:00.000Z',
        level: 'error',
        msg: 'boom',
        service: 'radarr',
        context: { instance: 'r1', status: 500 },
      },
    ]);
  });

  it('filtre par niveau minimal, service et texte (message et contexte), et pagine', () => {
    const buffer = new LogBuffer({ level: 'debug' });
    buffer.push(record(20, 'debug sonarr', { service: 'sonarr' }));
    buffer.push(record(40, 'radarr down', { service: 'radarr', networkCode: 'ECONNREFUSED' }));
    buffer.push(record(50, 'interne'));
    buffer.push(record(40, 'sonarr 500', { service: 'sonarr' }));
    expect(buffer.filter({ level: 'warn' }).map((entry) => entry.msg)).toEqual([
      'sonarr 500',
      'interne',
      'radarr down',
    ]);
    expect(buffer.filter({ service: 'sonarr' })).toHaveLength(2);
    expect(buffer.filter({ q: 'econnrefused' }).map((entry) => entry.msg)).toEqual(['radarr down']);
    expect(buffer.services()).toEqual(['radarr', 'sonarr']);

    const first = buffer.page({ limit: 3 });
    expect(first.entries.map((entry) => entry.id)).toEqual([4, 3, 2]);
    expect(first).toMatchObject({ total: 4, nextBefore: 2 });
    const second = buffer.page({ limit: 3, before: 2 });
    expect(second.entries.map((entry) => entry.id)).toEqual([1]);
    expect(second.nextBefore).toBeNull();
  });
});

describe('createLogStream', () => {
  function setup(consoleLevel: 'warn' | 'silent', bufferLevel: 'info' | 'warn') {
    const out: string[] = [];
    const buffer = new LogBuffer({ level: bufferLevel });
    const stream = createLogStream({
      consoleLevel,
      buffer,
      output: { write: (chunk: string) => out.push(chunk) },
    });
    return { out, buffer, stream };
  }
  const line = (value: object) => `${JSON.stringify(value)}\n`;

  it('masque avant la console et le tampon, chacun à son niveau', () => {
    const { out, buffer, stream } = setup('warn', 'info');
    stream.write(line({ level: 30, time: 1, msg: 'info', token: 'secret' }));
    stream.write(line({ level: 40, time: 2, msg: 'GET /api?apikey=abc', apiKey: 'abc' }));
    expect(out).toHaveLength(1);
    expect(out.join('')).not.toContain('abc');
    expect(buffer.size).toBe(2);
    expect(JSON.stringify(buffer.filter({}))).not.toMatch(/abc|secret/);
  });

  it('les traces de requêtes de Fastify vont à la console mais pas au tampon', () => {
    const { out, buffer, stream } = setup('warn', 'info');
    stream.write(line({ level: 40, msg: 'incoming request', req: { url: '/' } }));
    stream.write(line({ level: 40, msg: 'request completed', res: { statusCode: 200 } }));
    expect(out).toHaveLength(2);
    expect(buffer.size).toBe(0);
  });

  it('niveaux : le logger suit le plus bavard ; tampon par défaut au niveau de la console', () => {
    expect(loggerLevel('warn', 'info')).toBe('info');
    expect(loggerLevel('debug', 'warn')).toBe('debug');
    expect(loggerLevel('silent', 'error')).toBe('error');
    expect(defaultBufferLevel('info')).toBe('info');
    expect(defaultBufferLevel('silent')).toBe('warn');
    const { out, buffer, stream } = setup('silent', 'warn');
    stream.write(line({ level: 50, msg: 'x' }));
    expect(out).toHaveLength(0);
    expect(buffer.size).toBe(1);
  });
});
