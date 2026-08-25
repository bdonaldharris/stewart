import pytest
from pydantic import ValidationError

from stewart.contracts import (
    IMPACT_OUTPUT_KEY,
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    ImpactResult,
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


@pytest.mark.parametrize(
    ("status", "expected_step"),
    [
        ("COMPLETE", StewartNextStep.SYNTHESIZE),
        ("NEEDS_INFORMATION", StewartNextStep.ASK_WRITER),
    ],
)
def test_impact_contract_supports_both_statuses(
    status: str,
    expected_step: StewartNextStep,
) -> None:
    needs_information = status == "NEEDS_INFORMATION"
    decision = handle_specialist_result(
        IMPACT_OUTPUT_KEY,
        {
            "status": status,
            "sources": [],
            "assumptions_and_uncertainty": [],
            "additional_writer_context_required": needs_information,
            "clarification_question": "How central should this character become?"
            if needs_information
            else None,
            "impact_summary": None if needs_information else "The choice creates a recurring arc.",
            "risks": ["It may crowd an unresolved storyline."],
            "opportunities": ["It can connect two existing teams."],
            "affected_areas_and_entities": ["Nova Corps"],
            "future_implications": ["Creates a sequel dependency."],
            "audience_considerations": ["Established rules need a clear explanation."],
            "tradeoffs": [],
        },
    )

    assert isinstance(decision.result, ImpactResult)
    assert decision.next_step is expected_step


def test_complete_impact_requires_a_summary() -> None:
    with pytest.raises(ValidationError, match="impact_summary"):
        ImpactResult.model_validate(
            {
                "status": "COMPLETE",
                "sources": [],
                "assumptions_and_uncertainty": [],
                "additional_writer_context_required": False,
                "clarification_question": None,
                "impact_summary": None,
                "risks": [],
                "opportunities": [],
                "affected_areas_and_entities": [],
                "future_implications": [],
                "audience_considerations": [],
                "tradeoffs": [],
            }
        )
