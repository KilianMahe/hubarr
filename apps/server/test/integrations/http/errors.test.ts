// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `ClientErrorExtractionTest` et de `sanitizeLogBody`.

import { describe, expect, it } from 'vitest';
import { extractApiErrorMessage, sanitizeLogBody } from '../../../src/integrations/http/errors';

describe('extractApiErrorMessage', () => {
  it('lit errorMessage dans un objet JSON', () => {
    expect(
      extractApiErrorMessage(
        JSON.stringify({ errorMessage: 'QualityProfile [1] is in use.' }),
        400,
      ),
    ).toBe('QualityProfile [1] is in use.');
  });

  it('lit error, message et detail', () => {
    expect(extractApiErrorMessage(JSON.stringify({ error: 'Unauthorized' }), 401)).toBe(
      'Unauthorized',
    );
    expect(extractApiErrorMessage(JSON.stringify({ message: 'Resource not found' }), 404)).toBe(
      'Resource not found',
    );
    expect(extractApiErrorMessage(JSON.stringify({ detail: 'Conflict on tag id 42' }), 409)).toBe(
      'Conflict on tag id 42',
    );
  });

  it('joint les erreurs de validation par « ; »', () => {
    const body = JSON.stringify([
      { propertyName: 'name', errorMessage: 'Field A required' },
      { propertyName: 'value', errorMessage: 'Field B required' },
    ]);
    expect(extractApiErrorMessage(body, 400)).toBe(
      'name: Field A required; value: Field B required',
    );
  });

  it('renvoie un corps brut court', () => {
    expect(extractApiErrorMessage('Server is rebooting, try again later', 503)).toBe(
      'Server is rebooting, try again later',
    );
  });

  it("retombe sur l'erreur réseau, puis sur le code HTTP", () => {
    expect(extractApiErrorMessage('', 0, 'Connection refused')).toBe('Connection refused');
    expect(extractApiErrorMessage('', 500)).toBe('HTTP 500');
  });

  it('ignore un corps brut de 200 caractères ou plus', () => {
    expect(extractApiErrorMessage('A'.repeat(250), 502)).toBe('HTTP 502');
  });
});

describe('sanitizeLogBody', () => {
  it('masque les magnets et les clés d’API, puis tronque', () => {
    const body = 'magnet:?xt=urn:btih:ABC123&dn=x apikey=secret {"apiKey": "abc"}';
    const clean = sanitizeLogBody(body);
    expect(clean).toBe('[magnet] apikey=[redacted] {"apiKey": "[redacted]"}');
    expect(sanitizeLogBody('é'.repeat(250))).toBe(`${'é'.repeat(200)}…`);
    expect(sanitizeLogBody(null)).toBe('');
  });
});
