// SPDX-License-Identifier: AGPL-3.0-or-later
// Saisie en ligne de commande. Sur un terminal, la frappe est masquée (mode brut) ;
// sur une entrée redirigée (`printf '…\n…\n' | docker exec -i hubarr hubarr …`),
// les valeurs sont lues ligne à ligne.

import { createInterface } from 'node:readline';

export interface Prompter {
  askHidden(label: string): Promise<string>;
  close(): void;
}

export class PromptAbortedError extends Error {
  override readonly name = 'PromptAbortedError';
  constructor() {
    super('saisie interrompue');
  }
}

function askOnTerminal(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  label: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';
    output.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const finish = (error?: Error) => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error === undefined) resolve(value);
      else reject(error);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        // Ctrl+C, Ctrl+D
        if (char === '\u0003' || char === '\u0004') {
          finish(new PromptAbortedError());
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    input.on('data', onData);
  });
}

export function createPrompter(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Prompter {
  if (input.isTTY) {
    return { askHidden: (label) => askOnTerminal(input, output, label), close: () => undefined };
  }
  const lines = createInterface({ input, terminal: false })[Symbol.asyncIterator]();
  return {
    askHidden: async () => {
      const next = await lines.next();
      if (next.done === true) throw new PromptAbortedError();
      return next.value;
    },
    close: () => void lines.return?.(),
  };
}
