// SPDX-License-Identifier: AGPL-3.0-or-later
// Thème Vuetify, bascule du mode classique et script du premier rendu (P0.10).
import {
  ensureContrast,
  THEME_MODE_STORAGE_KEY,
  hslToHex,
  mixHex,
  serviceAccentColors,
  resolveTheme,
  type ResolvedTheme,
} from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import themeInitSource from '../public/theme-init.js?raw';
import { createHubarrVuetify } from '../src/app/plugins/vuetify';
import { readThemeMode, syncDocument, writeThemeMode } from '../src/app/theme/mode';
import {
  THEME_NAMES,
  activeThemeName,
  type BaseTheme,
  definitionFor,
  themeDefinitions,
  withBase,
} from '../src/app/theme/vuetify-theme';

const classic = resolveTheme(undefined, undefined);
const midnight = resolveTheme('midnight', undefined);
const latte = resolveTheme('catppuccin_latte', 'pink');

/** `Storage` en mémoire, éventuellement défaillant (navigation privée). */
function memoryStorage(initial: Record<string, string> = {}, failing = false): Storage {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (failing) throw new DOMException('refusé', 'SecurityError');
  };
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => (guard(), data.get(key) ?? null),
    setItem: (key, value) => {
      guard();
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function palette(theme: ResolvedTheme) {
  if (theme.kind !== 'preset') throw new Error('préréglage attendu');
  return theme.palette;
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme-mode');
  document.head.querySelector('meta[name="theme-color"]')?.remove();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme-mode');
});

describe('traduction en thème Vuetify', () => {
  it('reporte fond, surfaces, primaire, états et bordures', () => {
    const definition = definitionFor(palette(midnight), midnight.primary);
    expect(definition).toEqual({
      dark: true,
      colors: {
        background: '#111111',
        surface: '#1c1c1c',
        'surface-alt': '#161616',
        sidebar: '#0d0d0d',
        topbar: '#111111',
        // Indigo #6366f1 éclairci jusqu'à 4,5:1 sur les cartes (P5.5).
        primary: ensureContrast('#6366f1', '#1c1c1c'),
        ...serviceAccentColors(palette(midnight), midnight.primary, null),
        'on-background': palette(midnight).text,
        'on-surface': palette(midnight).text,
        muted: palette(midnight).textMuted,
        success: hslToHex(142, 71, 45),
        error: hslToHex(0, 84, 60),
      },
      variables: {
        'border-color': '#ffffff',
        'border-opacity': 0.08,
        'topbar-opacity': 0.95,
      },
    });
  });

  it('ajoute l’accent du service affiché', () => {
    const definition = definitionFor(palette(midnight), midnight.primary, 'radarr');
    expect(definition.colors.service).toBe('#fbbf24');
    expect(definition.colors['service-bar']).not.toBe(definition.colors.topbar);
  });

  it('mode classique : texte et états laissés au framework, texte secondaire opaque en emphase moyenne', () => {
    if (classic.kind !== 'classic') throw new Error('classique attendu');
    const definition = definitionFor(classic.light, classic.primary);
    expect(definition.colors).not.toHaveProperty('on-surface');
    expect(definition.colors).not.toHaveProperty('success');

    const base: BaseTheme = {
      colors: { 'on-surface': '#000000', success: '#4caf50' },
      variables: { 'medium-emphasis-opacity': 0.6 },
    };
    const merged = withBase(definition, base);
    expect(merged.colors).toMatchObject({
      background: '#f4f6fb',
      success: '#4caf50',
      // 60 % de noir sur #f4f6fb.
      muted: mixHex('#000000', '#f4f6fb', 0.6),
    });
  });

  it('classique : deux variantes ; préréglage : la même palette sous les deux noms', () => {
    const classicDefs = themeDefinitions(classic);
    expect(classicDefs[THEME_NAMES.dark].dark).toBe(true);
    expect(classicDefs[THEME_NAMES.light].dark).toBe(false);

    const latteDefs = themeDefinitions(latte);
    expect(latteDefs[THEME_NAMES.dark]).toEqual(latteDefs[THEME_NAMES.light]);
    // Rose #ec4899 assombri jusqu'à 4,5:1 sur les cartes claires (P5.5).
    expect(latteDefs[THEME_NAMES.light].colors.primary).toBe(
      ensureContrast('#ec4899', latte.kind === 'preset' ? latte.palette.surface : '#ffffff'),
    );
  });

  it('nom actif : variante choisie en classique, clarté du préréglage sinon', () => {
    expect(activeThemeName(classic, 'dark')).toBe(THEME_NAMES.dark);
    expect(activeThemeName(classic, 'light')).toBe(THEME_NAMES.light);
    expect(activeThemeName(latte, 'dark')).toBe(THEME_NAMES.light);
    expect(activeThemeName(midnight, 'light')).toBe(THEME_NAMES.dark);
  });
});

describe('variante enregistrée', () => {
  it('sombre par défaut, valeur inconnue ignorée, stockage défaillant toléré', () => {
    expect(readThemeMode(memoryStorage())).toBe('dark');
    expect(readThemeMode(memoryStorage({ [THEME_MODE_STORAGE_KEY]: 'light' }))).toBe('light');
    expect(readThemeMode(memoryStorage({ [THEME_MODE_STORAGE_KEY]: 'sepia' }))).toBe('dark');
    expect(readThemeMode(memoryStorage({}, true))).toBe('dark');
    expect(() => {
      writeThemeMode('light', memoryStorage({}, true));
    }).not.toThrow();
  });

  it('se reporte sur <html> et sur la balise theme-color', () => {
    syncDocument('light', palette(latte));
    expect(document.documentElement.getAttribute('data-theme-mode')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe(palette(latte).background);
  });
});

describe('contrôleur de thème', () => {
  it('mode classique : bascule entre les variantes et la mémorise', () => {
    const storage = memoryStorage();
    const { theme } = createHubarrVuetify(classic, { storage });
    expect(theme.toggleable.value).toBe(true);
    expect(theme.dark.value).toBe(true);
    expect(document.documentElement.getAttribute('data-theme-mode')).toBe('dark');

    theme.toggle();
    expect(theme.mode.value).toBe('light');
    expect(theme.dark.value).toBe(false);
    expect(storage.getItem(THEME_MODE_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme-mode')).toBe('light');
  });

  it('reprend la variante enregistrée au démarrage', () => {
    const storage = memoryStorage({ [THEME_MODE_STORAGE_KEY]: 'light' });
    const { theme } = createHubarrVuetify(classic, { storage });
    expect(theme.dark.value).toBe(false);
  });

  it('préréglage : palette fixe, bascule sans effet', () => {
    const storage = memoryStorage();
    const { theme } = createHubarrVuetify(latte, { storage });
    expect(theme.toggleable.value).toBe(false);
    expect(theme.dark.value).toBe(false);
    theme.toggle();
    expect(theme.mode.value).toBe('dark');
    expect(theme.dark.value).toBe(false);
    expect(storage.getItem(THEME_MODE_STORAGE_KEY)).toBeNull();
  });

  it('applique un nouveau thème sans recharger', () => {
    const { theme } = createHubarrVuetify(classic, { storage: memoryStorage() });
    theme.apply(latte);
    expect(theme.toggleable.value).toBe(false);
    expect(theme.theme.value.primary).toBe('#ec4899');
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      palette(latte).background,
    );
  });
});

describe('theme-init.js (avant le premier rendu)', () => {
  const source = themeInitSource;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- script public, exécuté tel que le navigateur le ferait
  const run = new Function(source) as () => void;

  afterEach(() => {
    localStorage.clear();
  });

  it('utilise la même clé de stockage que la SPA', () => {
    expect(source).toContain(`'${THEME_MODE_STORAGE_KEY}'`);
  });

  it('pose la variante enregistrée et ignore une valeur inconnue', () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'light');
    run();
    expect(document.documentElement.getAttribute('data-theme-mode')).toBe('light');

    document.documentElement.removeAttribute('data-theme-mode');
    localStorage.setItem(THEME_MODE_STORAGE_KEY, '"><script>');
    run();
    expect(document.documentElement.hasAttribute('data-theme-mode')).toBe(false);
  });
});

describe('accessibilité des thèmes (P5.5)', () => {
  it('texte, texte secondaire et primaire à 4,5:1 sur les cartes, pour chaque thème', async () => {
    const shared = await import('@hubarr/shared');
    const { definitionFor } = await import('../src/app/theme/vuetify-theme');
    const failures: string[] = [];
    const check = (name: string, color: string | undefined, background: string) => {
      if (color !== undefined && shared.contrastRatio(color, background) < 4.5) {
        failures.push(
          `${name} ${color}/${background} = ${shared.contrastRatio(color, background).toFixed(2)}`,
        );
      }
    };
    for (const choice of shared.THEME_CHOICES) {
      for (const accent of ['theme_default', 'red', 'yellow'] as const) {
        const theme = shared.resolveTheme(choice, accent);
        const palettes = theme.kind === 'classic' ? [theme.dark, theme.light] : [theme.palette];
        for (const palette of palettes) {
          const colors = definitionFor(palette, theme.primary).colors;
          const label = `${choice}/${accent}/${palette.dark ? 'sombre' : 'clair'}`;
          check(`${label} texte`, colors['on-surface'], palette.surface);
          check(`${label} secondaire`, colors.muted, palette.surface);
          check(`${label} secondaire/fond`, colors.muted, palette.background);
          check(`${label} primaire`, colors.primary, palette.surface);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
