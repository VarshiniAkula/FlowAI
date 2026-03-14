from typing import List


def chunk(text: str, chunk_size: int = 512, overlap: int = 64) -> List[str]:
    """Split text into overlapping chunks by character count."""
    if not text.strip():
        return []

    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(chunk_text)
        if end == text_len:
            break
        start = end - overlap

    return chunks
