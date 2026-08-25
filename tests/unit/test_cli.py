import asyncio
from unittest.mock import AsyncMock

import pytest

from stewart.cli import _run_conversation
from stewart.contracts import StewartNextStep
from stewart.runtime import RunResult, StewartConversation


def _turn(response: str, next_step: StewartNextStep) -> RunResult:
    return RunResult(
        response=response,
        agent_authors=("stewart", "lore_agent"),
        tool_calls=("lore_agent", "parallel_search"),
        next_step=next_step,
        lore_result=None,
    )


def test_cli_reuses_one_conversation_for_clarification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conversation = AsyncMock()
    conversation.send.side_effect = [
        _turn("When does it happen?", StewartNextStep.ASK_WRITER),
        _turn("Final considerations", StewartNextStep.SYNTHESIZE),
    ]
    create = AsyncMock(return_value=conversation)
    monkeypatch.setattr(StewartConversation, "create", create)
    monkeypatch.setattr("builtins.input", lambda _prompt: "Immediately after Endgame")

    asyncio.run(_run_conversation("A cosmic archivist appears."))

    create.assert_awaited_once_with()
    assert conversation.send.await_args_list[0].args == ("A cosmic archivist appears.",)
    assert conversation.send.await_args_list[1].args == ("Immediately after Endgame",)
