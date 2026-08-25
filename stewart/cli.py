"""Minimal CLI entry point for the Stewart vertical slice."""

from __future__ import annotations

import argparse
import asyncio
from typing import TYPE_CHECKING

from stewart.config import load_environment

if TYPE_CHECKING:
    from stewart.runtime import RunResult

EXIT_COMMANDS = {"exit", "quit"}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Submit an MCU creative proposal to Stewart.")
    parser.add_argument(
        "proposal",
        nargs="?",
        help="Natural-language creative proposal (prompts interactively when omitted).",
    )
    return parser


def main() -> None:
    """Run one in-memory Stewart conversation through completion or writer exit."""
    load_environment()
    args = _parser().parse_args()
    proposal = args.proposal or input("Writer proposal: ").strip()

    asyncio.run(_run_conversation(proposal))


async def _run_conversation(proposal: str) -> None:
    """Keep one ADK session alive across specialist clarification turns."""
    # Import after loading local configuration so agent model settings are available.
    from stewart.runtime import StewartConversation

    conversation = await StewartConversation.create()
    writer_message = proposal

    while True:
        result = await conversation.send(writer_message)
        _print_activity(result)
        print(f"\nStewart:\n{result.response}")
        if not result.needs_writer_input:
            return

        try:
            writer_message = input("\nWriter (or 'exit'): ").strip()
        except EOFError:
            return
        if writer_message.lower() in EXIT_COMMANDS:
            return


def _print_activity(result: RunResult) -> None:
    """Show operational specialist status without exposing model reasoning."""
    specialists = [
        ("Lore", result.lore_result),
        ("Timeline", result.timeline_result),
        ("Relationship", result.relationship_result),
        ("Impact", result.impact_result),
    ]
    active = [(name, specialist) for name, specialist in specialists if specialist is not None]
    if not active:
        return
    print("\nInvestigation status:")
    for name, specialist in active:
        status = specialist.status.value.lower().replace("_", " ")
        print(f"{name} Agent: {status}")


if __name__ == "__main__":
    main()
