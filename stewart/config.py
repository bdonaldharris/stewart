"""Local environment loading for Stewart development and CLI use."""

from dotenv import load_dotenv


def load_environment() -> None:
    """Load local overrides first, then fill missing values from `.env`."""
    load_dotenv(dotenv_path=".env.local")
    load_dotenv(dotenv_path=".env")
