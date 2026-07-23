/**
 * Text extraction for ingested files. Pure (no framework/Node-only imports)
 * so it can run in any server route. Supports the text formats FlowMind
 * ingests today; PDF/DOCX need heavier libraries (a Supabase Edge Function is
 * the planned home for those) and are rejected here.
 */

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.html', '.htm'];

export function isSupportedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Extract normalized plain text from a raw file buffer + name. */
export function extractText(bytes: Uint8Array, name: string): string {
  const lower = name.toLowerCase();
  let text = new TextDecoder('utf-8').decode(bytes);
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    text = stripHtml(text);
  }
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
