import pytest
from pydantic import ValidationError

from stewart.contracts import LoreResult


def test_needs_information_requires_a_clarification_question() -> None:
    with pytest.raises(ValidationError, match="clarification_question"):
        LoreResult.model_validate(
            {
                "status": "NEEDS_INFORMATION",
                "findings": [],
                "sources": [],
                "assumptions_and_uncertainty": [],
                "additional_writer_context_required": True,
                "clarification_question": None,
            }
        )


def test_complete_cannot_require_writer_context() -> None:
    with pytest.raises(ValidationError, match="COMPLETE cannot require"):
        LoreResult.model_validate(
            {
                "status": "COMPLETE",
                "findings": [],
                "sources": [],
                "assumptions_and_uncertainty": [],
                "additional_writer_context_required": True,
                "clarification_question": None,
            }
        )
