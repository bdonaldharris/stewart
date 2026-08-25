"""Narrow, secret-safe wrapper around Parallel's runtime Search API."""

from __future__ import annotations

import os
from collections.abc import Sequence
from typing import Any, Protocol

from parallel import APIError, AsyncParallel
from pydantic import BaseModel, ConfigDict, Field

PARALLEL_SEARCH_TIMEOUT_SECONDS = 20.0


class ParallelConfigurationError(RuntimeError):
    """Raised when Parallel cannot be configured."""


class ParallelSearchError(RuntimeError):
    """Raised when Parallel cannot complete a search."""


class ParallelRequestError(ValueError):
    """Raised when Stewart supplies an invalid Parallel search request."""


class _AsyncParallelSearchApi(Protocol):
    async def search(self, **kwargs: Any) -> Any: ...

    async def close(self) -> None: ...


class ParallelSource(BaseModel):
    """The provider response fields Lore is allowed to receive."""

    model_config = ConfigDict(extra="forbid")

    title: str
    url: str
    publish_date: str | None = None
    excerpts: list[str] = Field(default_factory=list)


class ParallelSearchResponse(BaseModel):
    """Sanitized Parallel response exposed to the Lore tool."""

    model_config = ConfigDict(extra="forbid")

    search_id: str | None = None
    results: list[ParallelSource]


class ParallelSearchClient:
    """Execute live Parallel searches without retaining retrieved knowledge."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        client: _AsyncParallelSearchApi | None = None,
        timeout_seconds: float = PARALLEL_SEARCH_TIMEOUT_SECONDS,
    ) -> None:
        resolved_key = api_key or os.getenv("PARALLEL_API_KEY")
        if client is None and not resolved_key:
            raise ParallelConfigurationError(
                "PARALLEL_API_KEY is required for runtime lore discovery"
            )
        self._client = client
        self._api_key = resolved_key
        self._timeout_seconds = timeout_seconds
        self._owns_client = False

    async def __aenter__(self) -> ParallelSearchClient:
        if self._client is None:
            self._client = AsyncParallel(
                api_key=self._api_key,
                timeout=self._timeout_seconds,
            )
            self._owns_client = True
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        if self._owns_client and self._client is not None:
            await self._client.close()
            self._client = None
            self._owns_client = False

    async def search(
        self,
        *,
        objective: str,
        search_queries: Sequence[str],
    ) -> ParallelSearchResponse:
        """Search Parallel and return only source metadata and relevant excerpts."""
        normalized_objective = objective.strip()
        normalized_queries = [query.strip() for query in search_queries if query.strip()]
        if not normalized_objective:
            raise ParallelRequestError("A non-empty search objective is required")
        if not normalized_queries:
            raise ParallelRequestError("At least one non-empty search query is required")
        if len(normalized_queries) > 5:
            raise ParallelRequestError("Stewart allows at most five search queries per lore task")

        if self._client is None:
            raise RuntimeError("ParallelSearchClient must be used as an async context manager")

        try:
            response = await self._client.search(
                objective=normalized_objective,
                search_queries=normalized_queries,
                timeout=self._timeout_seconds,
            )
        except APIError as exc:
            error_type = type(exc).__name__
            raise ParallelSearchError(
                f"Parallel search failed ({error_type}); "
                "check credentials, quota, and network access"
            ) from None

        raw_results = self._read(response, "results")
        if raw_results is None:
            raise TypeError("Parallel response did not include results")
        results = [self._sanitize_result(result) for result in raw_results]
        return ParallelSearchResponse(
            search_id=self._read(response, "search_id"),
            results=results,
        )

    @classmethod
    def _sanitize_result(cls, result: Any) -> ParallelSource:
        excerpts = cls._read(result, "excerpts") or []
        return ParallelSource(
            title=str(cls._read(result, "title") or "Untitled source"),
            url=str(cls._read(result, "url") or ""),
            publish_date=cls._string_or_none(cls._read(result, "publish_date")),
            excerpts=[str(excerpt) for excerpt in excerpts],
        )

    @staticmethod
    def _read(value: Any, field: str) -> Any:
        if isinstance(value, dict):
            return value.get(field)
        return getattr(value, field, None)

    @staticmethod
    def _string_or_none(value: Any) -> str | None:
        return None if value is None else str(value)


async def parallel_search(objective: str, search_queries: list[str]) -> dict[str, object]:
    """Discover current lore evidence through Parallel for one scoped investigation.

    Args:
        objective: A self-contained description of the lore evidence needed.
        search_queries: One to five concise, diverse web-search queries.

    Returns:
        A temporary, structured collection of sources and excerpts. On provider
        failure, returns a safe error message that never includes credentials.
    """
    try:
        async with ParallelSearchClient() as client:
            response = await client.search(
                objective=objective,
                search_queries=search_queries,
            )
        return {"ok": True, "search": response.model_dump(mode="json")}
    except (ParallelConfigurationError, ParallelSearchError, ParallelRequestError) as exc:
        return {"ok": False, "error": str(exc)}
