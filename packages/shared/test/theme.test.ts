// SPDX-License-Identifier: AGPL-3.0-or-later
// Thèmes (P0.10). Portés : `ColorMathTest`, `ThemePresetsTest`, `ThemeServiceTest`,
// `AdminSettingsThemeTest`, et les cas d'accent de `DisplayPreferencesServiceTest`.
import { describe, expect, it } from 'vitest';
import {
  ACCENT_CHOICES,
  ACCENT_COLORS,
  CLASSIC_THEME,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  DEFAULT_THEME_PRESET,
  SUPPORTED_LOCALES,
  THEME_CHOICES,
  THEME_PRESETS,
  THEME_PRESET_KEYS,
  clamp,
  contrastRatio,
  ensureContrast,
  flattenMessages,
  hslToHex,
  hslToRgbTuple,
  loadMessages,
  mixHex,
  resolveTheme,
  resolvedThemeSchema,
  themeLabelKey,
  type ResolvedTheme,
} from '../src';

function preset(theme: ResolvedTheme): Extract<ResolvedTheme, { kind: 'preset' }> {
  if (theme.kind !== 'preset') throw new Error(`préréglage attendu, reçu ${theme.kind}`);
  return theme;
}

function classic(theme: ResolvedTheme): Extract<ResolvedTheme, { kind: 'classic' }> {
  if (theme.kind !== 'classic') throw new Error(`mode classique attendu, reçu ${theme.kind}`);
  return theme;
}

function hexToRgbTuple(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}

describe('ColorMath', () => {
  it('convertit l’indigo de Tabler en tuple RGB et en hex', () => {
    // #6366f1 = hsl(239, 84%, 66.8%)
    expect(hslToRgbTuple(239, 84, 66.8)).toBe('99, 102, 241');
    expect(hslToHex(239, 84, 66.8)).toBe('#6366f1');
  });

  it('rend le noir et le blanc purs', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });

  it('borne les valeurs', () => {
    expect(clamp(-10)).toBe(0);
    expect(clamp(140)).toBe(100);
    expect(clamp(42)).toBe(42);
  });

  it('mélange deux couleurs comme une opacité posée sur un fond', () => {
    expect(mixHex('#ffffff', '#000000', 1)).toBe('#ffffff');
    expect(mixHex('#ffffff', '#000000', 0)).toBe('#000000');
    expect(mixHex('#ffffff', '#111111', 0.7)).toBe('#b8b8b8');
    expect(mixHex('#ff0000', '#0000ff', 2)).toBe('#ff0000');
  });

  it('ramène la teinte dans [0, 360[ et borne saturation et luminosité', () => {
    expect(hslToHex(360, 100, 50)).toBe(hslToHex(0, 100, 50));
    expect(hslToHex(-120, 100, 50)).toBe(hslToHex(240, 100, 50));
    expect(hslToHex(0, 150, 120)).toBe('#ffffff');
  });
});

describe('préréglages', () => {
  it('midnight est le préréglage de référence et reproduit le fond #111111', () => {
    expect(DEFAULT_THEME_PRESET).toBe('midnight');
    const { bg, light } = THEME_PRESETS.midnight;
    expect(hslToHex(...bg)).toBe('#111111');
    expect(light).toBe(false);
  });

  it('chaque préréglage a une forme complète', () => {
    for (const key of THEME_PRESET_KEYS) {
      const p = THEME_PRESETS[key];
      expect(typeof p.light, key).toBe('boolean');
      for (const color of [p.bg, p.primary, p.positive, p.negative]) {
        expect(color, key).toHaveLength(3);
      }
      expect(p.contrast, key).toBeGreaterThan(0);
      expect(p.textSaturation, key).toBeGreaterThan(0);
    }
  });

  it('reprend les 17 préréglages de l’original, dans le même ordre', () => {
    expect(THEME_PRESET_KEYS).toEqual([
      'midnight',
      'nord',
      'catppuccin_latte',
      'catppuccin_frappe',
      'catppuccin_macchiato',
      'catppuccin_mocha',
      'dracula',
      'gruvbox_dark',
      'kanagawa_dark',
      'teal_city',
      'camouflage',
      'tucan',
      'shades_of_purple',
      'neon_pink',
      'solarized_light',
      'peachy',
      'zebra',
    ]);
  });
});

describe('options du sélecteur (`AdminSettingsThemeTest`)', () => {
  it('`display_theme` : classique par défaut, puis les préréglages', () => {
    expect(DEFAULT_THEME).toBe(CLASSIC_THEME);
    expect(THEME_CHOICES).toEqual([CLASSIC_THEME, ...THEME_PRESET_KEYS]);
    expect(themeLabelKey('classic')).toBe('admin.display.theme.preset.classic');
  });

  it('`display_theme_color` : `theme_default` par défaut, puis les 6 accents', () => {
    expect(DEFAULT_ACCENT).toBe('theme_default');
    expect(ACCENT_CHOICES).toEqual([
      'theme_default',
      'indigo',
      'red',
      'green',
      'orange',
      'pink',
      'blue',
    ]);
  });

  it('chaque thème a son libellé dans les deux langues', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = flattenMessages(await loadMessages(locale));
      for (const choice of THEME_CHOICES) {
        expect(messages.has(themeLabelKey(choice)), `${locale} ${choice}`).toBe(true);
      }
    }
  });
});

describe('resolveTheme (`ThemeServiceTest`)', () => {
  it('une valeur absente, inconnue ou `classic` donne le mode classique', () => {
    for (const stored of [undefined, null, 'does-not-exist', 'classic', 42, 'toString']) {
      const theme = resolveTheme(stored, undefined);
      expect(theme.kind, String(stored)).toBe('classic');
      expect(theme.key).toBe(CLASSIC_THEME);
    }
  });

  it('mode classique : variante sombre de midnight sans texte ni états, variante claire écrite à la main', () => {
    const theme = classic(resolveTheme(undefined, undefined));
    expect(theme.dark.dark).toBe(true);
    expect(theme.dark.background).toBe('#111111');
    expect(theme.dark.text).toBeNull();
    expect(theme.dark.success).toBeNull();
    expect(theme.light.dark).toBe(false);
    expect(theme.light.background).toBe('#f4f6fb');
    expect(theme.light.surface).toBe('#ffffff');
    expect(theme.light.borderOpacity).toBe(0.08);
  });

  it('midnight : primaire indigo, fond et paliers de surface attendus', () => {
    const theme = preset(resolveTheme('midnight', undefined));
    expect(theme.key).toBe('midnight');
    expect(theme.primary).toBe('#6366f1');
    expect(theme.palette).toMatchObject({
      dark: true,
      background: '#111111', // hsl(0, 0%, 6.5%)
      surface: '#1c1c1c', // hsl(0, 0%, 11%)
      surfaceAlt: '#161616', // hsl(0, 0%, 8.5%)
      sidebar: '#0d0d0d', // hsl(0, 0%, 5%)
      topbar: '#111111',
      topbarOpacity: 0.95,
      border: '#ffffff',
      borderOpacity: 0.08,
      success: hslToHex(142, 71, 45),
      error: hslToHex(0, 84, 60),
    });
  });

  it('un préréglage clair donne une palette claire, bordure noire', () => {
    const theme = preset(resolveTheme('catppuccin_latte', undefined));
    expect(theme.palette.dark).toBe(false);
    expect(theme.palette.border).toBe('#000000');
    expect(theme.palette.borderOpacity).toBe(0.1);
  });

  it('le contraste renforce bordure et texte', () => {
    // neon_pink : contraste 1,5 → bordure 0,12, texte à 92 % de luminosité.
    const theme = preset(resolveTheme('neon_pink', undefined));
    expect(theme.palette.borderOpacity).toBe(0.12);
    expect(theme.palette.text).toBe(hslToHex(240, 27, 92));
    // Texte secondaire de la formule d'origine, éclairci jusqu'à 4,5:1 (P5.5).
    expect(theme.palette.textMuted).toBe(
      ensureContrast(
        ensureContrast(hslToHex(240, 27, 68 / 1.5), theme.palette.surface),
        theme.palette.background,
      ),
    );
    expect(
      contrastRatio(theme.palette.textMuted ?? '', theme.palette.surface),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('la saturation du texte suit son multiplicateur', () => {
    // peachy : saturation du fond 40 × 0,5, texte à 20 / 1,1 %.
    const theme = preset(resolveTheme('peachy', undefined));
    expect(theme.palette.text).toBe(hslToHex(28, 20, 20 / 1.1));
  });

  it('tout thème résolu respecte le contrat du bootstrap', () => {
    for (const choice of THEME_CHOICES) {
      for (const accent of ACCENT_CHOICES) {
        expect(resolvedThemeSchema.safeParse(resolveTheme(choice, accent)).success).toBe(true);
      }
    }
  });
});

describe('accent (`DisplayPreferencesServiceTest`)', () => {
  it('`theme_default` suit la primaire du préréglage, l’indigo en mode classique', () => {
    expect(resolveTheme(undefined, 'theme_default').primary).toBe('#6366f1');
    expect(resolveTheme('dracula', 'theme_default').primary).toBe(hslToHex(265, 89, 79));
    expect(resolveTheme('dracula', undefined).accent).toBe('theme_default');
  });

  it('un accent choisi remplace la primaire, en mode classique comme sur un préréglage', () => {
    expect(resolveTheme(undefined, 'green').primary).toBe('#22c55e');
    expect(resolveTheme('nord', 'pink').primary).toBe('#ec4899');
  });

  it('un accent inconnu retombe sur `theme_default`', () => {
    const theme = resolveTheme(undefined, 'neon-yellow');
    expect(theme.accent).toBe('theme_default');
    expect(theme.primary).toBe('#6366f1');
  });

  it('les accents gardent les tuples RGB de l’original', () => {
    const rgb = Object.fromEntries(
      Object.entries(ACCENT_COLORS).map(([name, hex]) => [name, hexToRgbTuple(hex)]),
    );
    expect(rgb).toEqual({
      indigo: '99, 102, 241',
      red: '239, 68, 68',
      green: '34, 197, 94',
      orange: '245, 158, 11',
      pink: '236, 72, 153',
      blue: '59, 130, 246',
    });
  });
});
