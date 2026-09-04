"""Defensive normalization for human-readable browser display text."""

from __future__ import annotations

import re
from urllib.parse import unquote_to_bytes

_PERCENT_BYTES = re.compile(r"(?:%[0-9A-Fa-f]{2})+")
_HEADING = re.compile(r"^\s{0,3}#{1,6}[ \t]+")
_TABLE_SEPARATOR = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$")
_BOLD_ASTERISKS = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")
_BOLD_UNDERSCORES = re.compile(r"__(?=\S)(.+?)(?<=\S)__")
_ITALIC_ASTERISKS = re.compile(r"(?<!\*)\*(?=\S)(.+?)(?<=\S)\*(?!\*)")
_ITALIC_UNDERSCORES = re.compile(r"(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)")
_INLINE_CODE = re.compile(r"`([^`\n]+)`")


def _decode_percent_encoded_unicode(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        try:
            decoded = unquote_to_bytes(match.group(0)).decode("utf-8")
        except UnicodeDecodeError:
            return match.group(0)
        return decoded if any(ord(character) > 127 for character in decoded) else match.group(0)

    return _PERCENT_BYTES.sub(replace, value)


def normalize_display_text(value: str) -> str:
    """Return plain Unicode prose without changing literal percentages or URLs.

    Callers must apply this only to human-readable fields. Source URLs remain
    outside this boundary and are intentionally passed through unchanged.
    """
    decoded = _decode_percent_encoded_unicode(value)
    normalized_lines: list[str] = []
    for raw_line in decoded.splitlines():
        if _TABLE_SEPARATOR.fullmatch(raw_line):
            continue
        line = _HEADING.sub("", raw_line).strip()
        if line.startswith("|") and line.endswith("|") and line.count("|") >= 2:
            line = " · ".join(cell.strip() for cell in line.strip("|").split("|") if cell.strip())
        line = _BOLD_ASTERISKS.sub(r"\1", line)
        line = _BOLD_UNDERSCORES.sub(r"\1", line)
        line = _ITALIC_ASTERISKS.sub(r"\1", line)
        line = _ITALIC_UNDERSCORES.sub(r"\1", line)
        line = _INLINE_CODE.sub(r"\1", line)
        normalized_lines.append(line)
    return "\n".join(normalized_lines).strip()
