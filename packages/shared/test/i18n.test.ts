// SPDX-License-Identifier: AGPL-3.0-or-later
// Intégrité des catalogues de traductions (parité FR/EN, ICU) et rendu ICU.
import { TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { IntlMessageFormat } from 'intl-messageformat';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IcuMessageCache,
  SUPPORTED_LOCALES,
  flattenMessages,
  loadMessages,
  type Locale,
} from '../src';

/** Noms des arguments ICU d'un message (`{count}`, `{count, plural, …}`…), balises comprises. */
function argumentNames(message: string, locale: string): string[] {
  const names = new Set<string>();
  const visit = (elements: readonly MessageFormatElement[]): void => {
    for (const element of elements) {
      // Hors texte et `#` d'un pluriel, chaque élément porte un nom d'argument.
      if (element.type !== TYPE.literal && element.type !== TYPE.pound) {
        names.add(element.value);
      }
      if ('options' in element) {
        for (const option of Object.values(element.options)) visit(option.value);
      }
      if ('children' in element) visit(element.children);
    }
  };
  visit(new IntlMessageFormat(message, locale, undefined, { ignoreTag: true }).getAst());
  return [...names].sort();
}

const catalogs = new Map<Locale, Map<string, string>>();

beforeAll(async () => {
  for (const locale of SUPPORTED_LOCALES) {
    catalogs.set(locale, flattenMessages(await loadMessages(locale)));
  }
});

function catalog(locale: Locale): Map<string, string> {
  const found = catalogs.get(locale);
  if (!found) throw new Error(`catalogue ${locale} absent`);
  return found;
}

describe('catalogues de traductions', () => {
  it('ont les mêmes clés en FR et en EN', () => {
    const en = [...catalog('en').keys()].sort();
    const fr = [...catalog('fr').keys()].sort();
    expect(en.length).toBeGreaterThan(0);
    expect(fr).toEqual(en);
  });

  it('gardent `yes` et `no` comme clés (YAML 1.2, comme Symfony)', () => {
    expect(catalog('fr').get('common.status.yes')).toBe('Oui');
    expect(catalog('fr').get('common.status.no')).toBe('Non');
    expect(catalog('en').get('calendar.months.full.11')).toBe('December');
  });

  it.each(SUPPORTED_LOCALES)('%s : chaque message est un ICU valide', (locale) => {
    const invalid: string[] = [];
    for (const [key, message] of catalog(locale)) {
      try {
        new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });
      } catch {
        invalid.push(key);
      }
    }
    expect(invalid).toEqual([]);
  });

  it('attendent les mêmes arguments en FR et en EN', () => {
    const mismatches: string[] = [];
    for (const [key, en] of catalog('en')) {
      const fr = catalog('fr').get(key) ?? '';
      if (argumentNames(en, 'en').join() !== argumentNames(fr, 'fr').join()) mismatches.push(key);
    }
    expect(mismatches).toEqual([]);
  });

  it('ne nomment plus Prismarr, hors du lien de crédit de la page À propos', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const named = [...catalog(locale)].filter(
        ([key, message]) => message.includes('Prismarr') && key !== 'admin.about.links.upstream',
      );
      expect(named).toEqual([]);
      expect(catalog(locale).get('app.name')).toBe('Hubarr');
    }
  });
});

describe('IcuMessageCache', () => {
  it('applique les règles de pluriel de chaque langue', () => {
    const icu = new IcuMessageCache();
    const message = '{count, plural, =0 {aucun} one {# élément} other {# éléments}}';
    expect(icu.format(message, 'fr', { count: 0 })).toBe('aucun');
    // En français, 0 et 1 sont au singulier (hors `=0`) ; en anglais, seul 1 l'est.
    expect(icu.format('{count, plural, one {#} other {# s}}', 'fr', { count: 1.5 })).toBe('1,5');
    expect(icu.format('{count, plural, one {#} other {# s}}', 'en', { count: 1.5 })).toBe('1.5 s');
    expect(icu.format(message, 'fr', { count: 1234 })).toBe('1\u202f234 éléments'); // espace fine insécable, comme ICU
  });

  it('rend un message du catalogue avec ses valeurs', () => {
    const icu = new IcuMessageCache();
    const message = catalog('fr').get('profile.stats.watchlist_label') ?? '';
    expect(icu.format(message, 'fr', { count: 0 })).toBe('Aucun film/série dans ma liste');
    expect(icu.format(message, 'fr', { count: 3 })).toBe('3 films/séries dans ma liste');
  });

  it('traite les apostrophes comme ICU', () => {
    const icu = new IcuMessageCache();
    expect(icu.format("Hubarr isn't reachable", 'en')).toBe("Hubarr isn't reachable");
    expect(icu.format("l''instance {name}", 'fr', { name: 'A' })).toBe("l'instance A");
    expect(icu.format("'{literal}' {name}", 'fr', { name: 'A' })).toBe('{literal} A');
  });

  it('laisse les balises HTML en texte, arguments compris', () => {
    const icu = new IcuMessageCache();
    expect(
      icu.format('Use <em>Test</em> on <a href="{url}">{name}</a>', 'en', {
        url: '/x',
        name: 'Radarr',
      }),
    ).toBe('Use <em>Test</em> on <a href="/x">Radarr</a>');
  });

  it('compile chaque message une seule fois par langue', () => {
    const icu = new IcuMessageCache();
    expect(icu.compile('{n} a', 'fr')).toBe(icu.compile('{n} a', 'fr'));
    icu.compile('{n} a', 'en');
    expect(icu.size).toBe(2);
  });

  it('rend le message tel quel et signale l’erreur : valeur manquante ou syntaxe invalide', () => {
    const errors: string[] = [];
    const icu = new IcuMessageCache((_error, message, locale) =>
      errors.push(`${locale}:${message}`),
    );
    expect(icu.format('{count} films', 'fr')).toBe('{count} films');
    expect(icu.format('{count, plural, one {x}', 'en', { count: 1 })).toBe(
      '{count, plural, one {x}',
    );
    expect(errors).toEqual(['fr:{count} films', 'en:{count, plural, one {x}']);
  });
});
