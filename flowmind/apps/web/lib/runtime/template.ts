/**
 * Render `{{variable}}` placeholders against a context dict.
 *
 * Unknown variables are replaced with an empty string and silently warned to
 * the trace, so a misconfigured node never crashes the run.
 */
export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = lookup(context, key);
    if (value === undefined || value === null) {
      missing.push(key);
      return '';
    }
    return String(value);
  });
  return { text, missing };
}

function lookup(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}
