"""Structured contracts shared between Stewart and its specialists."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SpecialistStatus(StrEnum):
    """Logical completion states available to every specialist."""

    COMPLETE = "COMPLETE"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"


# Preserve the established Lore name while sharing the same status contract.
LoreStatus = SpecialistStatus

LORE_OUTPUT_KEY = "lore_result"
TIMELINE_OUTPUT_KEY = "timeline_result"
RELATIONSHIP_OUTPUT_KEY = "relationship_result"
IMPACT_OUTPUT_KEY = "impact_result"
STEWARDSHIP_REPORT_OUTPUT_KEY = "stewardship_report"


class EvidenceSource(BaseModel):
    """A web source returned by Parallel and used in specialist analysis."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    url: str = Field(min_length=1)
    excerpts: list[str] = Field(default_factory=list)


class _SpecialistResultBase(BaseModel):
    """Status and evidence fields shared by all specialist contracts."""

    model_config = ConfigDict(extra="forbid")

    status: SpecialistStatus
    sources: list[EvidenceSource] = Field(default_factory=list)
    assumptions_and_uncertainty: list[str] = Field(default_factory=list)
    additional_writer_context_required: bool
    clarification_question: str | None = None

    @model_validator(mode="after")
    def validate_status_fields(self) -> _SpecialistResultBase:
        """Keep status and clarification fields internally consistent."""
        if self.status is SpecialistStatus.NEEDS_INFORMATION:
            if not self.additional_writer_context_required:
                raise ValueError(
                    "NEEDS_INFORMATION requires additional_writer_context_required=true"
                )
            if not self.clarification_question or not self.clarification_question.strip():
                raise ValueError("NEEDS_INFORMATION requires a clarification_question")
        elif self.additional_writer_context_required:
            raise ValueError("COMPLETE cannot require additional writer context")
        elif self.clarification_question is not None:
            raise ValueError("COMPLETE cannot include a clarification_question")
        return self


class LoreFinding(BaseModel):
    """A bounded lore observation tied to discovered evidence."""

    model_config = ConfigDict(extra="forbid")

    finding: str = Field(min_length=1)
    relevance: str = Field(min_length=1)
    canon_scope: Literal[
        "MCU_CANON",
        "COMICS_INSPIRATION",
        "CROSS_SOURCE",
        "UNCERTAIN",
    ]
    source_urls: list[str] = Field(default_factory=list)


class TimelineFinding(BaseModel):
    """A chronological observation tied to discovered evidence."""

    model_config = ConfigDict(extra="forbid")

    finding: str = Field(min_length=1)
    chronological_relevance: str = Field(min_length=1)
    chronology_status: Literal[
        "CONSISTENT",
        "POTENTIAL_CONTRADICTION",
        "TEMPORAL_DEPENDENCY",
        "UNCERTAIN",
    ]
    source_urls: list[str] = Field(default_factory=list)


class RelationshipFinding(BaseModel):
    """A character or organization relationship observation."""

    model_config = ConfigDict(extra="forbid")

    finding: str = Field(min_length=1)
    relationship_relevance: str = Field(min_length=1)
    relationship_type: Literal[
        "CHARACTER",
        "TEAM",
        "ORGANIZATION",
        "IDEOLOGICAL",
        "UNCERTAIN",
    ]
    source_urls: list[str] = Field(default_factory=list)


class LoreResult(_SpecialistResultBase):
    """The predictable response contract returned by Lore to Stewart."""

    findings: list[LoreFinding] = Field(default_factory=list)


class TimelineResult(_SpecialistResultBase):
    """The predictable response contract returned by Timeline to Stewart."""

    findings: list[TimelineFinding] = Field(default_factory=list)


class RelationshipResult(_SpecialistResultBase):
    """The predictable response contract returned by Relationship to Stewart."""

    findings: list[RelationshipFinding] = Field(default_factory=list)


class ImpactTradeoff(BaseModel):
    """The practical upside and cost of one creative approach."""

    model_config = ConfigDict(extra="forbid")

    approach: str = Field(min_length=1)
    benefits: list[str] = Field(default_factory=list)
    costs: list[str] = Field(default_factory=list)


class ImpactResult(_SpecialistResultBase):
    """The predictable consequence analysis returned by Impact to Stewart."""

    impact_summary: str | None = None
    risks: list[str] = Field(default_factory=list)
    opportunities: list[str] = Field(default_factory=list)
    affected_areas_and_entities: list[str] = Field(default_factory=list)
    future_implications: list[str] = Field(default_factory=list)
    audience_considerations: list[str] = Field(default_factory=list)
    tradeoffs: list[ImpactTradeoff] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_complete_summary(self) -> ImpactResult:
        """Require a useful synthesis when Impact completes."""
        if self.status is SpecialistStatus.COMPLETE and (
            not self.impact_summary or not self.impact_summary.strip()
        ):
            raise ValueError("COMPLETE Impact result requires an impact_summary")
        return self


class StewardshipOption(BaseModel):
    """One decision path synthesized by Stewart for the writer."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    benefits: list[str] = Field(min_length=1)
    tradeoffs: list[str] = Field(min_length=1)


class StewardshipReport(BaseModel):
    """Stewart's prioritized decision-support synthesis."""

    model_config = ConfigDict(extra="forbid")

    assessment: str = Field(min_length=1)
    continuity_considerations: list[str] = Field(min_length=1)
    opportunities: list[str] = Field(default_factory=list)
    audience_considerations: list[str] = Field(default_factory=list)
    options: list[StewardshipOption] = Field(min_length=1)


SpecialistResult: TypeAlias = LoreResult | TimelineResult | RelationshipResult | ImpactResult


class StewartNextStep(StrEnum):
    """Deterministic status interpretation owned by Stewart."""

    ANALYZE_IMPACT = "ANALYZE_IMPACT"
    SYNTHESIZE = "SYNTHESIZE"
    ASK_WRITER = "ASK_WRITER"


@dataclass(frozen=True)
class SpecialistBranchDecision:
    """Deterministic decision Stewart makes from one validated result."""

    output_key: str
    result: SpecialistResult
    next_step: StewartNextStep

    @property
    def writer_response_override(self) -> str | None:
        """Return the clarification fallback, when one is required."""
        if self.next_step is StewartNextStep.ASK_WRITER:
            return self.result.clarification_question
        return None


_RESULT_MODELS: dict[str, type[SpecialistResult]] = {
    LORE_OUTPUT_KEY: LoreResult,
    TIMELINE_OUTPUT_KEY: TimelineResult,
    RELATIONSHIP_OUTPUT_KEY: RelationshipResult,
    IMPACT_OUTPUT_KEY: ImpactResult,
}


def handle_specialist_result(
    output_key: str,
    validated_output: SpecialistResult | Mapping[str, object],
) -> SpecialistBranchDecision:
    """Validate ADK structured output and select Stewart's production branch."""
    try:
        result_model = _RESULT_MODELS[output_key]
    except KeyError as error:
        raise ValueError(f"Unknown specialist output key: {output_key}") from error

    result = (
        validated_output
        if isinstance(validated_output, result_model)
        else result_model.model_validate(validated_output)
    )
    next_step = (
        StewartNextStep.ASK_WRITER
        if result.status is SpecialistStatus.NEEDS_INFORMATION
        else StewartNextStep.SYNTHESIZE
    )
    return SpecialistBranchDecision(output_key=output_key, result=result, next_step=next_step)
