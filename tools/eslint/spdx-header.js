// SPDX-License-Identifier: AGPL-3.0-or-later
// Règle ESLint locale : chaque fichier source commence par l'identifiant de
// licence SPDX (CLAUDE.md). Un shebang éventuel est toléré avant.

const ID = 'SPDX-License-Identifier: AGPL-3.0-or-later';

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: `Exige l'en-tête « ${ID} » en tête de fichier.` },
    fixable: 'code',
    schema: [],
    messages: { missing: `En-tête « ${ID} » manquant en tête de fichier.` },
  },
  create(context) {
    return {
      Program() {
        const source = context.sourceCode.text;
        const shebang = /^#![^\n]*\n/.exec(source)?.[0] ?? '';
        const text = source.slice(shebang.length);
        const isVue = context.filename.endsWith('.vue');
        const expected = isVue ? `<!-- ${ID} -->` : `// ${ID}`;
        if (text.startsWith(expected)) return;
        context.report({
          loc: { line: 1, column: 0 },
          messageId: 'missing',
          fix: (fixer) =>
            fixer.insertTextBeforeRange([shebang.length, shebang.length], `${expected}\n`),
        });
      },
    };
  },
};
