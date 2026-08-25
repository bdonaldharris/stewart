import pytest
from pydantic import ValidationError

from stewart.contracts import (
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    LoreResult,
    RelationshipResult,
    StewartNextStep,
    TimelineResult,
    handle_specialist_result,
)


@pytest.mark.parametrize("result_model", [LoreResult, TimelineResult, RelationshipResult])
def test_needs_information_requires_a_clarification_question(result_model: type) -> None:
    with pytest.raises(ValidationError, match="clarification_question"):
        result_model.model_validate(
            {
                "status": "NEEDS_INFORMATION",
                "findings": [],
                "sources": [],
                "assumptions_and_uncertainty": [],
                "additional_writer_context_required": True,
                "clarification_question": None,
            }
        )


@pytest.mark.parametrize("result_model", [LoreResult, TimelineResult, RelationshipResult])
def test_complete_cannot_require_writer_context(result_model: type) -> None:
    with pytest.raises(ValidationError, match="COMPLETE cannot require"):
        result_model.model_validate(
            {
                "status": "COMPLETE",
                "findings": [],
                "sources": [],
                "assumptions_and_uncertainty": [],
                "additional_writer_context_required": True,
                "clarification_question": None,
            }
        )


@pytest.mark.parametrize(
    ("output_key", "result_model"),
    [
        (LORE_OUTPUT_KEY, LoreResult),
        (TIMELINE_OUTPUT_KEY, TimelineResult),
        (RELATIONSHIP_OUTPUT_KEY, RelationshipResult),
    ],
)
@pytest.mark.parametrize(
    ("status", "expected_step"),
    [
        ("COMPLETE", StewartNextStep.SYNTHESIZE),
        ("NEEDS_INFORMATION", StewartNextStep.ASK_WRITER),
    ],
)
def test_production_contract_handler_branches_for_each_specialist(
    output_key: str,
    result_model: type,
    status: str,
    expected_step: StewartNextStep,
) -> None:
    needs_information = status == "NEEDS_INFORMATION"
    decision = handle_specialist_result(
        output_key,
        {
            "status": status,
            "findings": [],
            "sources": [],
            "assumptions_and_uncertainty": [],
            "additional_writer_context_required": needs_information,
            "clarification_question": "What is the intended context?"
            if needs_information
            else None,
        },
    )

    assert isinstance(decision.result, result_model)
    assert decision.next_step is expected_step
