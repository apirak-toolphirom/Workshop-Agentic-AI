const GEMINI_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...schema };
  if (typeof schema.type === 'string' && GEMINI_TYPES.has(schema.type)) {
    result.type = schema.type.toUpperCase();
  }

  if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      properties[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? toGeminiSchema(value as Record<string, unknown>)
        : value;
    }
    result.properties = properties;
  }

  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    result.items = toGeminiSchema(schema.items as Record<string, unknown>);
  }
  return result;
}