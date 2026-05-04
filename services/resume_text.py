"""Extract plain text from resume PDFs for AI prompts (optional dependency: pypdf)."""

from __future__ import annotations

import os
from typing import Optional

try:
    from pypdf import PdfReader  # type: ignore
except Exception:  # pragma: no cover
    PdfReader = None  # type: ignore


class ResumePdfError(Exception):
    pass


def extract_pdf_text(path: str, *, max_chars: Optional[int] = None) -> str:
    """Read a PDF and return concatenated text. Truncates to max_chars if set."""
    if not path or not os.path.isfile(path):
        raise ResumePdfError(f"Resume file not found: {path}")
    if PdfReader is None:
        raise ResumePdfError(
            "pypdf is not installed. Run: pip install pypdf"
        )
    try:
        reader = PdfReader(path)
        parts: list[str] = []
        for page in reader.pages:
            t = page.extract_text() or ""
            parts.append(t)
        text = "\n".join(parts).strip()
    except Exception as exc:
        raise ResumePdfError(f"Could not read PDF: {exc}") from exc
    if not text:
        raise ResumePdfError("No extractable text in PDF (scanned image-only resume?)")
    if max_chars is not None and max_chars > 0 and len(text) > max_chars:
        text = text[:max_chars] + "\n\n[…truncated for AI context…]"
    return text
