// Minimal zod -> JSON Schema converter covering exactly the zod constructs used by
// AI_TOOL_SCHEMAS (@sonic-gameworld/world-schema): object, string, number, boolean, enum, array,
// record, union, optional, default, nullable, and ZodEffects (the `.refine()` wrapper used by
// modify_entity/delete_entity). Not a general-purpose converter — deliberately small so we don't
// need to pull in a third-party zod-to-json-schema dependency for two provider adapters.
import { z } from 'zod';

type JSONSchema = Record<string, unknown>;

function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean } {
  let cur = schema;
  let optional = false;
  // Peel ZodEffects (refine/transform), ZodOptional, ZodDefault, ZodNullable in any order until
  // we hit a "base" type.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const def = cur._def as { typeName?: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
    if (def.typeName === 'ZodOptional') {
      optional = true;
      cur = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (def.typeName === 'ZodDefault') {
      optional = true;
      cur = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (def.typeName === 'ZodNullable') {
      cur = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (def.typeName === 'ZodEffects') {
      cur = def.schema as z.ZodTypeAny;
      continue;
    }
    break;
  }
  return { inner: cur, optional };
}

function convert(schema: z.ZodTypeAny): JSONSchema {
  const { inner } = unwrap(schema);
  const def = inner._def as { typeName?: string };

  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum': {
      const values = (inner as z.ZodEnum<[string, ...string[]]>).options;
      return { type: 'string', enum: values };
    }
    case 'ZodLiteral':
      return { const: (inner as z.ZodLiteral<unknown>).value };
    case 'ZodArray': {
      const el = (inner as z.ZodArray<z.ZodTypeAny>).element;
      return { type: 'array', items: convert(el) };
    }
    case 'ZodRecord':
      return { type: 'object', additionalProperties: true };
    case 'ZodUnion': {
      const options = (inner as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>).options as z.ZodTypeAny[];
      return { anyOf: options.map(convert) };
    }
    case 'ZodObject':
      return objectSchema(inner as z.AnyZodObject);
    default:
      return {};
  }
}

function objectSchema(obj: z.AnyZodObject): JSONSchema {
  const shape = obj.shape as Record<string, z.ZodTypeAny>;
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    const { optional } = unwrap(field);
    properties[key] = convert(field);
    if (!optional) required.push(key);
  }
  const schema: JSONSchema = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

/** Convert a tool's zod args schema into a JSON Schema object suitable for Anthropic's
 * `input_schema` / Gemini's `functionDeclarations[].parameters`. */
export function zodToJsonSchema(schema: z.ZodTypeAny): JSONSchema {
  const { inner } = unwrap(schema);
  if ((inner._def as { typeName?: string }).typeName === 'ZodObject') {
    return objectSchema(inner as z.AnyZodObject);
  }
  return convert(schema);
}
