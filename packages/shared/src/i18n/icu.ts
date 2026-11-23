// SPDX-License-Identifier: AGPL-3.0-or-later
// Formatage ICU MessageFormat des traductions.
//
// Les catalogues sont repris de Prismarr, rendus par le `MessageFormatter` d'ICU
// (domaine `+intl-icu` de Symfony). `intl-messageformat` suit les mêmes règles :
// pluriels et `select` selon la locale, `#` dans un pluriel, apostrophe simple
// littérale sauf devant `{`, `}`, `#` ou `|`, et `''` pour une apostrophe.
// Les balises HTML (`<em>`, `<strong>`, `<a href="{url}">`) restent du texte :
// c'est au composant d'afficher le résultat en HTML s'il le faut.

import { IntlMessageFormat, type PrimitiveType } from 'intl-messageformat';

export type MessageValues = Readonly<Record<string, PrimitiveType>>;

/** Message dont la source est invalide : rendu tel quel, comme repli. */
class RawMessage {
  constructor(private readonly source: string) {}
  format(): string {
    return this.source;
  }
}

type CompiledMessage = IntlMessageFormat | RawMessage;

/** Erreur de syntaxe ICU (compilation) ou valeur manquante (formatage). */
export type IcuErrorHandler = (error: Error, message: string, locale: string) => void;

/**
 * Compile une fois chaque couple (locale, message) puis le formate. Les
 * erreurs ne remontent jamais à l'appelant : un message invalide, ou formaté
 * sans l'une de ses valeurs, est rendu tel quel (comme le `MessageFormatter`
 * de PHP, qui laisse `{count}` en place) et signalé à `onError`.
 */
export class IcuMessageCache {
  private readonly compiled = new Map<string, CompiledMessage>();

  constructor(private readonly onError: IcuErrorHandler = () => undefined) {}

  get size(): number {
    return this.compiled.size;
  }

  compile(message: string, locale: string): CompiledMessage {
    const cacheKey = `${locale}\u0000${message}`;
    let entry = this.compiled.get(cacheKey);
    if (!entry) {
      try {
        entry = new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });
      } catch (error) {
        this.onError(toError(error), message, locale);
        entry = new RawMessage(message);
      }
      this.compiled.set(cacheKey, entry);
    }
    return entry;
  }

  format(message: string, locale: string, values?: MessageValues): string {
    try {
      // Valeurs primitives et balises ignorées : le résultat est toujours une chaîne.
      return String(this.compile(message, locale).format(values));
    } catch (error) {
      this.onError(toError(error), message, locale);
      return message;
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
