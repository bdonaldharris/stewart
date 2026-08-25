"""Structured contract shared between Lore and Stewart."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LoreStatus(StrEnum):
    """Logical completion states available to the Lore specialist."""

    COMPLETE = "COMPLETE"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"


LORE_OUTPUT_KEY = "lore_result"


class EvidenceSource(BaseModel):
    """A web source returned by Parallel and used in Lore's analysis."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    url: str = Field(min_length=1)
    excerpts: list[str] = Field(default_factory=list)


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


class LoreResult(BaseModel):
    """The predictable response contract returned by Lore to Stewart."""

    model_config = ConfigDict(extra="forbid")

    status: LoreStatus
    findings: list[LoreFinding] = Field(default_factory=list)
    sources: list[EvidenceSource] = Field(default_factory=list)
    assumptions_and_uncertainty: list[str] = Field(default_factory=list)
    additional_writer_context_required: bool
    clarification_question: str | None = None

    @model_validator(mode="after")
    def validate_status_fields(self) -> LoreResult:
        """Keep status and clarification fields internally consistent."""
        if self.status is LoreStatus.NEEDS_INFORMATION:
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


class StewartNextStep(StrEnum):
    """Deterministic status interpretation owned by Stewart."""

    SYNTHESIZE = "SYNTHESIZE"
    ASK_WRITER = "ASK_WRITER"


@dataclass(frozen=True)
class LoreBranchDecision:
    """Deterministic decision Stewart makes from validated Lore output."""

    result: LoreResult
    next_step: StewartNextStep

    @property
    def writer_response_override(self) -> str | None:
        """Return the exact clarification Stewart must surface, when required."""
        if self.next_step is StewartNextStep.ASK_WRITER:
            return self.result.clarification_question
        return None


def handle_lore_result(
    validated_output: LoreResult | Mapping[str, object],
) -> LoreBranchDecision:
    """Validate ADK's structured output and select Stewart's production branch."""
    result = (
        validated_output
        if isinstance(validated_output, LoreResult)
        else LoreResult.model_validate(validated_output)
    )
    next_step = (
        StewartNextStep.ASK_WRITER
        if result.status is LoreStatus.NEEDS_INFORMATION
        else StewartNextStep.SYNTHESIZE
    )
    return LoreBranchDecision(result=result, next_step=next_step)
