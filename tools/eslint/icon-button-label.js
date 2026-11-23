// SPDX-License-Identifier: AGPL-3.0-or-later
// Règle ESLint locale (P5.5, accessibilité) : un bouton réduit à une icône
// (`<v-btn icon>` / `:icon="…"`, `<v-app-bar-nav-icon>`) doit porter un nom
// accessible (`aria-label` ou `title`, statique ou lié) : sans texte, un
// lecteur d'écran ne l'annoncerait que comme « bouton ».

const NAME_ATTRIBUTES = new Set(['aria-label', 'title', 'aria-labelledby']);
const ICON_ONLY = new Set(['v-btn', 'VBtn']);

function attributeName(attribute) {
  if (!attribute.directive) return attribute.key.rawName;
  // `:aria-label="…"` / `v-bind:title="…"`
  if (attribute.key.name?.name === 'bind' && attribute.key.argument?.type === 'VIdentifier') {
    return attribute.key.argument.rawName;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Exige un nom accessible sur les boutons réduits à une icône.' },
    schema: [],
    messages: { missing: 'Bouton icône sans nom accessible : ajouter :aria-label="t(…)".' },
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
      VElement(node) {
        const names = node.startTag.attributes.map(attributeName).filter(Boolean);
        // `v-bind="props"` (activateur de menu) : le nom vient parfois de l'objet lié.
        const spread = node.startTag.attributes.some(
          (a) => a.directive && a.key.name?.name === 'bind' && a.key.argument === null,
        );
        const iconOnly =
          node.rawName === 'v-app-bar-nav-icon' ||
          (ICON_ONLY.has(node.rawName) && names.includes('icon'));
        if (!iconOnly || spread) return;
        if (names.some((name) => NAME_ATTRIBUTES.has(name))) return;
        context.report({ node: node.startTag, messageId: 'missing' });
      },
    });
  },
};
