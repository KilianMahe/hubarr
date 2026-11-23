// SPDX-License-Identifier: AGPL-3.0-or-later
// Schémas zod comme schémas de route Fastify : validation des entrées, filtrage
// des réponses (les clés absentes du schéma ne sortent jamais, comme un hash de
// mot de passe) et types inférés dans les handlers. Équivalent minimal de
// `fastify-type-provider-zod`, qui imposerait `@fastify/swagger`.

import type { FastifyInstance, FastifyTypeProvider } from 'fastify';
import type { z } from 'zod';

export interface ZodTypeProvider extends FastifyTypeProvider {
  validator: this['schema'] extends z.ZodType ? z.output<this['schema']> : unknown;
  serializer: this['schema'] extends z.ZodType ? z.input<this['schema']> : unknown;
}

function isZodSchema(schema: unknown): schema is z.ZodType {
  return typeof schema === 'object' && schema !== null && 'safeParse' in schema;
}

export function registerZod(app: FastifyInstance): void {
  app.setValidatorCompiler(({ schema }) => {
    if (!isZodSchema(schema)) throw new Error('schéma de route non zod');
    return (data) => {
      const result = schema.safeParse(data);
      return result.success ? { value: result.data } : { error: result.error };
    };
  });
  app.setSerializerCompiler(({ schema }) => {
    if (!isZodSchema(schema)) throw new Error('schéma de réponse non zod');
    return (data) => JSON.stringify(schema.parse(data));
  });
}
