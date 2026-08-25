import asyncio
import os

import pytest

from stewart.contracts import StewartNextStep
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
def test_live_stewart_lore_parallel_vertical_slice() -> None:
    if os.getenv("RUN_STEWART_INTEGRATION") != "1":
        pytest.skip("set RUN_STEWART_INTEGRATION=1 to run live agent integration")
    if not _has_gemini_credentials() or not os.getenv("PARALLEL_API_KEY"):
        pytest.fail("live integration requires Gemini and PARALLEL_API_KEY credentials")

    result = asyncio.run(
        run_proposal(
            "Introduce a recurring cosmic archivist after Avengers: Endgame who once worked "
            "with the Nova Corps and can preserve memories from destroyed worlds."
        )
    )

    assert result.response.strip()
    assert "lore_agent" in result.agent_authors
    assert result.next_step is not None
    assert result.lore_result is not None

    if result.next_step is StewartNextStep.SYNTHESIZE:
        assert "parallel_search" in result.tool_calls
        assert result.lore_result.findings
        assert result.lore_result.sources
        assert any(source.url and source.excerpts for source in result.lore_result.sources)
    else:
        assert result.next_step is StewartNextStep.ASK_WRITER
        assert result.lore_result.clarification_question
        assert result.lore_result.clarification_question.strip()
