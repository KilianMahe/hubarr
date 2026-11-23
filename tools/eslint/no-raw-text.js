// SPDX-License-Identifier: AGPL-3.0-or-later
// Règle ESLint locale (P5.4, CLAUDE.md « aucun texte en dur dans le front ») :
// signale le texte écrit en clair dans un template Vue, ou dans un attribut
// statique affiché (`label`, `placeholder`, `title`, `aria-label`…), au lieu
// d'une clé i18n. Remplace `@intlify/vue-i18n/no-raw-text` sans
// dépendance : seuls comptent les mots (deux lettres ou plus) ; ponctuation,
// chiffres, symboles et noms propres de produits (liste ci-dessous) sont admis.

/** Noms de produits, sigles et unités qui ne se traduisent pas. */
const ALLOWED = new Set([
  'Hubarr',
  'Prismarr',
  'Radarr',
  'Sonarr',
  'Prowlarr',
  'Bazarr',
  'Seerr',
  'Jellyseerr',
  'Jellyfin',
  'Plex',
  'Emby',
  'Tautulli',
  'Tracearr',
  'qBittorrent',
  'Transmission',
  'Deluge',
  'SABnzbd',
  'NZBGet',
  'Gluetun',
  'TMDb',
  'TMDB',
  'IMDb',
  'TheTVDB',
  'YouTube',
  'GitHub',
  'Forgejo',
  // Licence (pied des écrans d'authentification).
  'AGPL',
  'API',
  'URL',
  'VPN',
  'iCal',
  'JSON',
  'HTTP',
  'HTTPS',
  'SSL',
  'RSS',
  'IP',
  'ms',
  'Mo',
  'Go',
  'Ko',
  'MB',
  'GB',
  'KB',
  'Mbps',
  'kbps',
  'fps',
  'HDR',
  'SDR',
  'UHD',
  'HD',
  'SD',
]);

const ATTRIBUTES = new Set([
  'label',
  'placeholder',
  'title',
  'aria-label',
  'alt',
  'hint',
  'text',
  'subtitle',
  'messages',
  'prepend-text',
  'append-text',
]);

/** Vrai si le texte contient un mot à traduire. */
export function hasRawWords(text) {
  const words = (text.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? []).map((w) => w.replace(/['’-]+$/u, ''));
  return words.some((word) => {
    if (ALLOWED.has(word)) return false;
    // Lettres isolées (« x », « S01E02 » découpé) et unités collées aux chiffres.
    return [...word.replace(/['’-]/g, '')].length >= 2;
  });
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Interdit le texte en clair dans les templates Vue (clé i18n attendue).' },
    schema: [],
    messages: {
      text: 'Texte en clair « {{text}} » : utiliser une clé i18n (t(…)).',
      attribute: 'Attribut « {{name}} » en clair : utiliser une clé i18n (:{{name}}="t(…)").',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (
      !context.filename.endsWith('.vue') ||
      typeof services?.defineTemplateBodyVisitor !== 'function'
    ) {
      return {};
    }
    return services.defineTemplateBodyVisitor({
      VText(node) {
        const text = node.value.trim();
        if (text === '' || !hasRawWords(text)) return;
        // Contenu de <code>, <pre> et <kbd> : valeurs techniques montrées telles quelles.
        const parent = node.parent?.rawName?.toLowerCase();
        if (parent === 'code' || parent === 'pre' || parent === 'kbd') return;
        context.report({ node, messageId: 'text', data: { text: text.slice(0, 40) } });
      },
      VAttribute(node) {
        if (node.directive || node.value === null) return;
        const name = node.key.rawName.toLowerCase();
        if (!ATTRIBUTES.has(name) || !hasRawWords(node.value.value)) return;
        context.report({ node, messageId: 'attribute', data: { name } });
      },
    });
  },
};
