from stewart.display_text import normalize_display_text


def test_normalize_display_text_decodes_unicode_and_removes_markdown_artifacts() -> None:
    normalized = normalize_display_text(
        "### **A prot%C3%A9g%C3%A9** is *important* at 50% capacity.\n"
        "| Area | Effect |\n"
        "| --- | --- |\n"
        "| Team | _Changed_ |"
    )

    assert normalized == ("A protégé is important at 50% capacity.\nArea · Effect\nTeam · Changed")


def test_normalize_display_text_preserves_legitimate_percent_signs_and_ascii_escapes() -> None:
    value = "Confidence is 50%; keep the literal token %25 and invalid UTF-8 %C3."

    assert normalize_display_text(value) == value
