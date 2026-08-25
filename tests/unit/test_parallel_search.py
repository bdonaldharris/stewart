import asyncio
import inspect
import traceback
from dataclasses import dataclass

import httpx
import pytest
from parallel import APIConnectionError, AsyncParallel

import stewart.parallel_search as parallel_module
from stewart.parallel_search import (
    PARALLEL_SEARCH_TIMEOUT_SECONDS,
    ParallelConfigurationError,
    ParallelSearchClient,
    ParallelSearchError,
    ParallelSearchResponse,
    ParallelSource,
)


@dataclass
class _Result:
    title: str
    url: str
    publish_date: str
    excerpts: list[str]


@dataclass
class _Response:
    search_id: str
    results: list[_Result]


class _SuccessfulApi:
    async def search(self, **kwargs: object) -> _Response:
        assert kwargs == {
            "objective": "Find MCU evidence",
            "search_queries": ["MCU cosmic organization"],
            "timeout": PARALLEL_SEARCH_TIMEOUT_SECONDS,
        }
        return _Response(
            search_id="search_123",
            results=[
                _Result(
                    title="Official Marvel page",
                    url="https://www.marvel.com/example",
                    publish_date="2026-01-02",
                    excerpts=["Evidence excerpt"],
                )
            ],
        )

    async def close(self) -> None:
        raise AssertionError("injected clients are not owned by the wrapper")


class _FailingApi:
    def __init__(self, secret: str) -> None:
        self.secret = secret

    async def search(self, **kwargs: object) -> _Response:
        request = httpx.Request("POST", "https://api.parallel.ai/v1/search")
        raise APIConnectionError(message=f"authorization failed for {self.secret}", request=request)

    async def close(self) -> None:
        raise AssertionError("injected clients are not owned by the wrapper")


class _DefectiveApi:
    async def search(self, **kwargs: object) -> _Response:
        raise RuntimeError("internal sanitization path defect")

    async def close(self) -> None:
        raise AssertionError("injected clients are not owned by the wrapper")


class _OwnedApi(_SuccessfulApi):
    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True


async def _search(client: ParallelSearchClient) -> ParallelSearchResponse:
    async with client:
        return await client.search(
            objective=" Find MCU evidence ",
            search_queries=[" MCU cosmic organization "],
        )


def test_successful_search_returns_sanitized_structured_results() -> None:
    response = asyncio.run(_search(ParallelSearchClient(client=_SuccessfulApi())))

    assert response.search_id == "search_123"
    assert response.results[0].url == "https://www.marvel.com/example"
    assert response.results[0].excerpts == ["Evidence excerpt"]


def test_owned_async_client_is_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    api = _OwnedApi()

    def create_client(**kwargs: object) -> _OwnedApi:
        assert kwargs["timeout"] == PARALLEL_SEARCH_TIMEOUT_SECONDS
        return api

    monkeypatch.setattr(parallel_module, "AsyncParallel", create_client)

    response = asyncio.run(_search(ParallelSearchClient(api_key="test-key")))

    assert response.search_id == "search_123"
    assert api.closed is True


def test_missing_api_key_has_clear_configuration_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PARALLEL_API_KEY", raising=False)

    with pytest.raises(ParallelConfigurationError, match="PARALLEL_API_KEY is required"):
        ParallelSearchClient()


def test_provider_failure_never_leaks_credentials() -> None:
    secret = "parallel-secret-value"

    with pytest.raises(ParallelSearchError) as caught:
        asyncio.run(_search(ParallelSearchClient(client=_FailingApi(secret))))

    assert "Parallel search failed" in str(caught.value)
    assert secret not in str(caught.value)
    assert secret not in "".join(traceback.format_exception(caught.value))


def test_internal_defects_are_not_misreported_as_provider_failures() -> None:
    with pytest.raises(RuntimeError, match="internal sanitization path defect"):
        asyncio.run(_search(ParallelSearchClient(client=_DefectiveApi())))


@pytest.mark.parametrize("queries", [[], ["   "]])
def test_search_requires_at_least_one_query(queries: list[str]) -> None:
    async def exercise() -> None:
        async with ParallelSearchClient(client=_SuccessfulApi()) as client:
            await client.search(objective="Find MCU evidence", search_queries=queries)

    with pytest.raises(ValueError, match="At least one"):
        asyncio.run(exercise())


def test_five_query_limit_is_identified_as_a_stewart_limit() -> None:
    async def exercise() -> None:
        async with ParallelSearchClient(client=_SuccessfulApi()) as client:
            await client.search(
                objective="Find MCU evidence",
                search_queries=["one", "two", "three", "four", "five", "six"],
            )

    with pytest.raises(ValueError, match="Stewart allows at most five"):
        asyncio.run(exercise())


class _ToolClient:
    def __init__(self, *, failure: bool = False) -> None:
        self.failure = failure
        self.closed = False

    async def __aenter__(self) -> "_ToolClient":
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        self.closed = True

    async def search(self, **kwargs: object) -> ParallelSearchResponse:
        if self.failure:
            raise ParallelSearchError("Parallel search failed (APIConnectionError)")
        return ParallelSearchResponse(
            search_id="search_tool",
            results=[
                ParallelSource(
                    title="Source",
                    url="https://example.com",
                    excerpts=["Excerpt"],
                )
            ],
        )


def test_parallel_search_tool_returns_success_envelope_and_closes_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _ToolClient()
    monkeypatch.setattr(parallel_module, "ParallelSearchClient", lambda: client)

    result = asyncio.run(parallel_module.parallel_search("objective", ["query"]))

    assert result["ok"] is True
    assert result["search"]["search_id"] == "search_tool"
    assert client.closed is True


def test_parallel_search_tool_returns_graceful_failure_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _ToolClient(failure=True)
    monkeypatch.setattr(parallel_module, "ParallelSearchClient", lambda: client)

    result = asyncio.run(parallel_module.parallel_search("objective", ["query"]))

    assert result == {
        "ok": False,
        "error": "Parallel search failed (APIConnectionError)",
    }
    assert client.closed is True


def test_parallel_sdk_search_signature_matches_wrapper() -> None:
    signature = inspect.signature(AsyncParallel.search)

    assert inspect.iscoroutinefunction(AsyncParallel.search)
    assert {"objective", "search_queries", "timeout"} <= set(signature.parameters)
