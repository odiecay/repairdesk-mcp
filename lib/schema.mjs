import { z } from 'zod';

// Convert the checked-in OpenAPI request schemas to MCP/Zod inputs.
export function toZod(schema = {}, components = {}, depth = 0) {
  if (depth > 20) throw new Error('Recursive request schema exceeds supported depth.');
  if (schema.$ref) {
    const name = schema.$ref.split('/').at(-1);
    if (!components[name]) throw new Error(`Unresolved schema: ${name}`);
    return toZod(components[name], components, depth + 1);
  }
  const convert = s => toZod(s, components, depth + 1);
  let value;
  if (schema.enum?.length) {
    const literals = schema.enum.map(x => z.literal(x));
    value = literals.length === 1 ? literals[0] : z.union(literals);
  } else if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf).map(convert);
    value = variants.length === 1 ? variants[0] : z.union(variants);
  } else if (schema.allOf) value = schema.allOf.map(convert).reduce((a, b) => z.intersection(a, b));
  else if (schema.type === 'object' || schema.properties) {
    const shape = {};
    for (const [key, child] of Object.entries(schema.properties || {})) {
      const field = convert(child);
      shape[key] = schema.required?.includes(key) ? field : field.optional();
    }
    value = z.object(shape);
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') value = value.catchall(convert(schema.additionalProperties));
    else value = schema.additionalProperties === false ? value.strict() : value.passthrough();
  } else if (schema.type === 'array') {
    value = z.array(convert(schema.items || {}));
    if (schema.minItems !== undefined) value = value.min(schema.minItems);
    if (schema.maxItems !== undefined) value = value.max(schema.maxItems);
  } else if (schema.type === 'integer' || schema.type === 'number') {
    value = schema.type === 'integer' ? z.number().int() : z.number();
    if (schema.minimum !== undefined) value = value.min(schema.minimum);
    if (schema.maximum !== undefined) value = value.max(schema.maximum);
  } else if (schema.type === 'boolean') value = z.boolean();
  else if (schema.type === 'string') {
    value = z.string();
    if (schema.minLength !== undefined) value = value.min(schema.minLength);
    if (schema.maxLength !== undefined) value = value.max(schema.maxLength);
  } else value = z.unknown();
  if (schema.nullable) value = value.nullable();
  if (schema.description) value = value.describe(schema.description);
  return value;
}
