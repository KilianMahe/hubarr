// SPDX-License-Identifier: AGPL-3.0-or-later
// Formats : port de `DisplayPreferencesServiceTest` (dates, heures, fuseau) et de
// `DisplayPreferencesExtensionTest` (tailles et débits).

import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_SECTIONS,
  DISPLAY_OPTIONS,
  defaultDisplayValues,
  displayOptionLabelKey,
  formatBytes,
  gigabytesToBytes,
  sizeParts,
  formatDate,
  formatDateTime,
  formatSpeed,
  formatTime,
  byteUnits,
} from '../src/index';
import { flattenMessages } from '../src/i18n/catalogs';
import en from '../src/i18n/en.json';

const paris = { dateFormat: 'fr', timeFormat: '24h', timezone: 'Europe/Paris' };
// 21/04/2026 12:30:07 UTC = 14:30:07 à Paris (heure d'été).
const at = new Date(Date.UTC(2026, 3, 21, 12, 30, 7));

describe('dates et heures', () => {
  it('format de date', () => {
    expect(formatDate(at, paris)).toBe('21/04/2026');
    expect(formatDate(at, { ...paris, dateFormat: 'us' })).toBe('Apr 21, 2026');
    expect(formatDate(at, { ...paris, dateFormat: 'iso' })).toBe('2026-04-21');
  });

  it('format d’heure, secondes en option', () => {
    expect(formatTime(at, paris)).toBe('14:30');
    expect(formatTime(at, { ...paris, timeFormat: '12h' })).toBe('2:30 PM');
    expect(formatTime(at, paris, true)).toBe('14:30:07');
    expect(formatTime(at, { ...paris, timeFormat: '12h' }, true)).toBe('2:30:07 PM');
    expect(
      formatTime(new Date(Date.UTC(2026, 3, 21, 22, 5)), { ...paris, timeFormat: '12h' }),
    ).toBe('12:05 AM');
  });

  it('fuseau appliqué', () => {
    expect(formatTime(at, { ...paris, timezone: 'America/New_York' })).toBe('08:30');
  });

  it('date et heure jointes', () => {
    expect(formatDateTime(at, { ...paris, dateFormat: 'iso' })).toBe('2026-04-21 · 14:30');
    expect(formatDateTime(at, { ...paris, dateFormat: 'iso' }, true)).toBe('2026-04-21 · 14:30:07');
  });

  it('valeur absente ou invalide → null ; fuseau invalide toléré', () => {
    expect(formatDate(null, paris)).toBeNull();
    expect(formatDate('pas une date', paris)).toBeNull();
    expect(formatDate(at, { ...paris, timezone: 'Mars/Olympus' })).toMatch(/^\d{2}\/04\/2026$/);
  });
});

describe('tailles et débits', () => {
  it.each([
    [42, '42 B'],
    [2048, '2.0 KB'],
    [5 * 1048576, '5.0 MB'],
    [3 * 1073741824, '3.0 GB'],
    [2 * 1099511627776, '2.0 TB'],
    [Math.trunc(1.5 * 1073741824), '1.5 GB'],
    [0, '0 B'],
  ])('anglais : %d → %s', (bytes, expected) => {
    expect(formatBytes(bytes, 'en')).toBe(expected);
  });

  it.each([
    [42, '42 o'],
    [2048, '2.0 Ko'],
    [5 * 1048576, '5.0 Mo'],
    [3 * 1073741824, '3.0 Go'],
    [2 * 1099511627776, '2.0 To'],
    [0, '0 o'],
  ])('français : %d → %s', (bytes, expected) => {
    expect(formatBytes(bytes, 'fr')).toBe(expected);
  });

  it('absent ou non numérique → tiret ; débit ; précision', () => {
    expect(formatBytes(null, 'en')).toBe('—');
    expect(formatBytes('', 'en')).toBe('—');
    // Valeur et unité séparées, taille donnée en Go (P5d.5, V29).
    expect(sizeParts(gigabytesToBytes(2048), 'fr')).toEqual({ value: '2.0', unit: 'To' });
    expect(sizeParts(gigabytesToBytes(512.25), 'en')).toEqual({ value: '512.3', unit: 'GB' });
    expect(sizeParts('x', 'en')).toBeNull();
    expect(formatBytes('not-a-number', 'en')).toBe('—');
    expect(formatSpeed(5 * 1048576, 'en')).toBe('5.0 MB/s');
    expect(formatSpeed(Math.trunc(1.5 * 1048576), 'fr')).toBe('1.5 Mo/s');
    expect(formatBytes(Math.trunc(1.5 * 1048576), 'en', 2)).toBe('1.50 MB');
    expect(formatBytes(1048576, 'en', 0)).toBe('1 MB');
    expect(byteUnits('fr').GB).toBe('Go');
    expect(byteUnits('de').GB).toBe('GB');
  });
});

describe('options d’affichage', () => {
  const keys = new Set(flattenMessages(en).keys());

  it('chaque libellé, aide et valeur a sa clé de traduction', () => {
    for (const [key, spec] of Object.entries(DISPLAY_OPTIONS)) {
      expect(keys.has(spec.labelKey), spec.labelKey).toBe(true);
      if ('helpKey' in spec) expect(keys.has(spec.helpKey), spec.helpKey).toBe(true);
      if (spec.type !== 'select' || !('options' in spec)) continue;
      for (const value of spec.options) {
        const label = displayOptionLabelKey(key as keyof typeof DISPLAY_OPTIONS, value);
        expect(keys.has(label), label).toBe(true);
      }
    }
    for (const section of DASHBOARD_SECTIONS)
      expect(keys.has(`dashboard.${section}.title`)).toBe(true);
  });

  it('valeurs par défaut', () => {
    expect(defaultDisplayValues('UTC')).toMatchObject({
      display_home_page: 'dashboard',
      display_timezone: 'UTC',
    });
  });
});
