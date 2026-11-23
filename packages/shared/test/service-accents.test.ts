// SPDX-License-Identifier: AGPL-3.0-or-later
// Accent par service (P0.12) : catalogue des services, contraste
// garanti sur toutes les palettes (17 préréglages, deux variantes classiques),
// repli sur l'accent du thème hors d'une vue de service.
import { describe, expect, it } from 'vitest';
import {
  SERVICES,
  SERVICE_ACCENTS,
  SERVICE_FAMILIES,
  SERVICE_IDS,
  THEME_PRESET_KEYS,
  contrastRatio,
  ensureContrast,
  isServiceId,
  readableOn,
  resolveTheme,
  serviceAccentColors,
  type ThemePalette,
} from '../src';

function allPalettes(): { name: string; palette: ThemePalette; primary: string }[] {
  const out: { name: string; palette: ThemePalette; primary: string }[] = [];
  const classic = resolveTheme('classic', undefined);
  if (classic.kind !== 'classic') throw new Error('classique attendu');
  out.push({ name: 'classic/dark', palette: classic.dark, primary: classic.primary });
  out.push({ name: 'classic/light', palette: classic.light, primary: classic.primary });
  for (const key of THEME_PRESET_KEYS) {
    const theme = resolveTheme(key, undefined);
    if (theme.kind !== 'preset') throw new Error('préréglage attendu');
    out.push({ name: key, palette: theme.palette, primary: theme.primary });
  }
  return out;
}

describe('catalogue des services', () => {
  it('compte les 15 services du plan, chacun dans une famille connue et avec ses teintes', () => {
    expect(SERVICE_IDS).toHaveLength(15);
    for (const id of SERVICE_IDS) {
      expect(SERVICE_FAMILIES).toContain(SERVICES[id].family);
      expect(SERVICE_ACCENTS[id].dark).toMatch(/^#[0-9a-f]{6}$/);
      expect(SERVICE_ACCENTS[id].light).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(SERVICES.radarr.multiInstance).toBe(true);
    expect(SERVICES.sonarr.multiInstance).toBe(true);
    expect(isServiceId('radarr')).toBe(true);
    expect(isServiceId('toString')).toBe(false);
    expect(isServiceId(null)).toBe(false);
  });
});

describe('contraste', () => {
  it('calcule les rapports WCAG de référence', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('ajuste une teinte trop pâle ou trop sombre, et laisse une teinte lisible intacte', () => {
    expect(ensureContrast('#fbbf24', '#111111')).toBe('#fbbf24');
    const onLight = ensureContrast('#fbbf24', '#ffffff');
    expect(contrastRatio(onLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    const onDark = ensureContrast('#1d4ed8', '#111111');
    expect(contrastRatio(onDark, '#111111')).toBeGreaterThanOrEqual(4.5);
    expect(readableOn('#fbbf24')).toBe('#141414');
    expect(readableOn('#1d4ed8')).toBe('#ffffff');
  });
});

describe('serviceAccentColors', () => {
  const palettes = allPalettes();

  it.each(palettes)(
    'reste lisible sur la palette $name pour chaque service',
    ({ palette, primary }) => {
      for (const service of [...SERVICE_IDS, null]) {
        const colors = serviceAccentColors(palette, primary, service);
        const label = `${service ?? 'thème'} sur ${palette.surface}`;
        expect(contrastRatio(colors.service, palette.surface), label).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(colors['service-text'], palette.surface),
          label,
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors['on-service'], colors.service), label).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrastRatio(colors['on-service-container'], colors['service-container']),
          label,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('reprend l’accent du thème et la barre du thème hors d’une vue de service', () => {
    const { palette, primary } =
      palettes[0] ??
      (() => {
        throw new Error('palette');
      })();
    const colors = serviceAccentColors(palette, primary, null);
    expect(colors['service-bar']).toBe(palette.topbar);
    expect(colors['service-text']).toBe(ensureContrast(primary, palette.surface));
    // Indigo du thème classique : texte blanc sur les boutons pleins (maquettes P0.11).
    expect(colors['on-service']).toBe('#ffffff');
  });

  it('teinte la barre du haut et choisit la variante selon la palette', () => {
    const dark = palettes.find((p) => p.name === 'classic/dark');
    const light = palettes.find((p) => p.name === 'classic/light');
    if (!dark || !light) throw new Error('palettes classiques attendues');
    const onDark = serviceAccentColors(dark.palette, dark.primary, 'radarr');
    expect(onDark.service).toBe('#fbbf24');
    expect(onDark['service-bar']).not.toBe(dark.palette.topbar);
    const onLight = serviceAccentColors(light.palette, light.primary, 'radarr');
    expect(contrastRatio(onLight['service-text'], light.palette.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(onLight.service).not.toBe('#fbbf24');
    expect(onDark['on-service']).toBe('#141414');
  });
});
