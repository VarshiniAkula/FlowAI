from pathlib import Path


def parse_pdf(path: str | Path) -> str:
    try:
        import PyPDF2
    except ImportError:
        raise ImportError("PyPDF2 is required: pip install PyPDF2")

    text_parts = []
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    return "\n\n".join(text_parts)


def parse_docx(path: str | Path) -> str:
    try:
        from docx import Document
    except ImportError:
        raise ImportError("python-docx is required: pip install python-docx")

    doc = Document(str(path))
    return "\n".join(para.text for para in doc.paragraphs if para.text.strip())


def parse_txt(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8", errors="replace")


def parse(path: str | Path, file_type: str) -> str:
    """Dispatch to the correct parser based on file_type."""
    ft = file_type.lower().lstrip(".")
    if ft == "pdf":
        return parse_pdf(path)
    elif ft in ("docx", "doc"):
        return parse_docx(path)
    elif ft in ("txt", "md", "text"):
        return parse_txt(path)
    else:
        # Fallback: try as plain text
        return parse_txt(path)
