import asyncio
import os

import pytest

from stewart.contracts import SpecialistStatus
from stewart.runtime import run_proposal


def _has_gemini_credentials() -> bool:
    if os.getenv("GOOGLE_API_KEY"):
        return True
    return bool(
        os.getenv("GOOGLE_GENAI_USE_VERTEXAI")
        and os.getenv("GOOGLE_CLOUD_PROJECT")
        and os.getenv("GOOGLE_CLOUD_LOCATION")
    )


@pytest.mark.integration
def test_live_stewart_concurrent_specialist_parallel_slice() -> None:
    if os.getenv("RUN_STEWART_INTEGRATION") != "1":
        pytest.skip("set RUN_STEWART_INTEGRATION=1 to run live agent integration")
    if not _has_gemini_credentials() or not os.getenv("PARALLEL_API_KEY"):
        pytest.fail("live integration requires Gemini and PARALLEL_API_KEY credentials")

    result = asyncio.run(
        run_proposal(
            "Introduce a recurring cosmic archivist immediately after Avengers: Endgame. The "
            "archivist once worked with the Nova Corps, has a strained alliance with the "
            "Guardians of the Galaxy, and can preserve memories from destroyed worlds. "
            "Investigate the relevant lore, chronology, and relationships."
        )
    )

    assert result.response.strip()
    assert result.next_step is not None
    assert result.lore_result is not None
    assert result.timeline_result is not None
    assert result.relationship_result is not None

    for agent_name, specialist_result in [
        ("lore_agent", result.lore_result),
        ("timeline_agent", result.timeline_result),
        ("relationship_agent", result.relationship_result),
    ]:
        assert agent_name in result.agent_authors
        if specialist_result.status is SpecialistStatus.COMPLETE:
            assert specialist_result.findings
            assert specialist_result.sources
            assert any(source.url and source.excerpts for source in specialist_result.sources)
        else:
            assert specialist_result.status is SpecialistStatus.NEEDS_INFORMATION
            assert specialist_result.clarification_question
            assert specialist_result.clarification_question.strip()

    assert "parallel_search" in result.tool_calls or any(
        specialist.status is SpecialistStatus.NEEDS_INFORMATION
        for specialist in result.specialist_results.values()
    )
