import os

from stewart.config import load_environment


def test_env_local_takes_precedence_and_env_remains_a_fallback(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("STEWART_TEST_PRIMARY", raising=False)
    monkeypatch.delenv("STEWART_TEST_FALLBACK", raising=False)
    (tmp_path / ".env.local").write_text("STEWART_TEST_PRIMARY=local\n")
    (tmp_path / ".env").write_text("STEWART_TEST_PRIMARY=base\nSTEWART_TEST_FALLBACK=base\n")

    load_environment()

    assert os.environ["STEWART_TEST_PRIMARY"] == "local"
    assert os.environ["STEWART_TEST_FALLBACK"] == "base"
