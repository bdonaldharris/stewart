"""Minimal CLI entry point for the Stewart vertical slice."""

from __future__ import annotations

import argparse
import asyncio

from dotenv import load_dotenv

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
    load_dotenv()
    args = _parser().parse_args()
    proposal = args.proposal or input("Writer proposal: ").strip()

    asyncio.run(_run_conversation(proposal))


async def _run_conversation(proposal: str) -> None:
    """Keep one ADK session alive across any Lore clarification turns."""
    # Import after loading .env so agent model configuration sees local values.
    from stewart.runtime import StewartConversation

    conversation = await StewartConversation.create()
    writer_message = proposal

    while True:
        result = await conversation.send(writer_message)
        print(f"\nStewart:\n{result.response}")
        if not result.needs_writer_input:
            return

        try:
            writer_message = input("\nWriter (or 'exit'): ").strip()
        except EOFError:
            return
        if writer_message.lower() in EXIT_COMMANDS:
            return


if __name__ == "__main__":
    main()
