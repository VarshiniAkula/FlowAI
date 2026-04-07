/**
 * Split a long text into roughly fixed-size chunks with overlap so retrieval
 * can return contiguous spans without losing sentence boundaries.
 *
 * Targets ~600 character windows with 80 chars of overlap. We try to break on
 * paragraph or sentence boundaries inside each window for cleaner chunks.
 */
export interface Chunk {
  index: number;
  text: string;
}

export function chunkText(
  raw: string,
  { size = 600, overlap = 80 }: { size?: number; overlap?: number } = {},
): Chunk[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const chunks: Chunk[] = [];
  let cursor = 0;
  let i = 0;

  while (cursor < text.length) {
    let end = Math.min(cursor + size, text.length);

    // Try to break on a paragraph or sentence boundary inside the window
    if (end < text.length) {
      const slice = text.slice(cursor, end);
      const para = slice.lastIndexOf('\n\n');
      const sent = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! '),
      );
      if (para > size * 0.5) {
        end = cursor + para + 2;
      } else if (sent > size * 0.5) {
        end = cursor + sent + 2;
      }
    }

    const piece = text.slice(cursor, end).trim();
    if (piece) {
      chunks.push({ index: i++, text: piece });
    }

    if (end >= text.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
}
