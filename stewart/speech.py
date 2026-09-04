"""Deterministic Google Cloud speech synthesis for Stewart's spoken output."""

from __future__ import annotations

import inspect
from collections.abc import Callable
from enum import StrEnum
from typing import Protocol

from google.api_core import exceptions as google_exceptions
from google.cloud import texttospeech_v1 as texttospeech

STEWART_VOICE = "en-GB-Neural2-B"
STEWART_LANGUAGE_CODE = "en-GB"
STEWART_AUDIO_ENCODING = texttospeech.AudioEncoding.MP3
STEWART_AUDIO_CONTENT_TYPE = "audio/mpeg"
STEWART_SPEECH_TIMEOUT_SECONDS = 5.0
MAX_SPEECH_CHARACTERS = 1_000

FIXED_LIFECYCLE_PHRASES = frozenset(
    {
        "I'm sending your proposal to the investigation team.",
        "Lore investigation complete.",
        "Timeline investigation complete.",
        "Relationship investigation complete.",
        "Impact investigation complete.",
    }
)


class SpeechFailureKind(StrEnum):
    """Expected provider failure categories exposed to the HTTP adapter."""

    PERMISSION = "permission"
    QUOTA = "quota"
    TIMEOUT = "timeout"
    UNAVAILABLE = "unavailable"


class SpeechProviderError(RuntimeError):
    """A safe, categorized Google TTS failure."""

    def __init__(self, kind: SpeechFailureKind) -> None:
        super().__init__(kind.value)
        self.kind = kind


class SpeechClient(Protocol):
    """The small async Google client surface used by Stewart."""

    transport: SpeechTransport

    async def synthesize_speech(
        self,
        *,
        request: texttospeech.SynthesizeSpeechRequest,
        timeout: float,
    ) -> texttospeech.SynthesizeSpeechResponse: ...


class SpeechTransport(Protocol):
    """The closeable transport owned by Google's async client."""

    def close(self) -> object: ...


SpeechClientFactory = Callable[[], SpeechClient]


class GoogleSpeechProvider:
    """Generate one MP3 utterance with Stewart's locked Google voice."""

    def __init__(
        self,
        *,
        client_factory: SpeechClientFactory = texttospeech.TextToSpeechAsyncClient,
        timeout: float = STEWART_SPEECH_TIMEOUT_SECONDS,
    ) -> None:
        self._client_factory = client_factory
        self._timeout = timeout
        self._client: SpeechClient | None = None

    async def synthesize(self, text: str) -> bytes:
        request = texttospeech.SynthesizeSpeechRequest(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(
                language_code=STEWART_LANGUAGE_CODE,
                name=STEWART_VOICE,
            ),
            audio_config=texttospeech.AudioConfig(audio_encoding=STEWART_AUDIO_ENCODING),
        )
        try:
            response = await self._get_client().synthesize_speech(
                request=request,
                timeout=self._timeout,
            )
        except (google_exceptions.Unauthenticated, google_exceptions.PermissionDenied) as error:
            raise SpeechProviderError(SpeechFailureKind.PERMISSION) from error
        except (google_exceptions.ResourceExhausted, google_exceptions.TooManyRequests) as error:
            raise SpeechProviderError(SpeechFailureKind.QUOTA) from error
        except google_exceptions.DeadlineExceeded as error:
            raise SpeechProviderError(SpeechFailureKind.TIMEOUT) from error
        except google_exceptions.GoogleAPICallError as error:
            raise SpeechProviderError(SpeechFailureKind.UNAVAILABLE) from error

        audio = bytes(response.audio_content)
        if not audio:
            raise SpeechProviderError(SpeechFailureKind.UNAVAILABLE)
        return audio

    async def close(self) -> None:
        if self._client is None:
            return
        result = self._client.transport.close()
        if inspect.isawaitable(result):
            await result
        self._client = None

    def _get_client(self) -> SpeechClient:
        if self._client is None:
            self._client = self._client_factory()
        return self._client


class StewartSpeechSynthesizer:
    """Add process-local caching for Stewart's fixed lifecycle phrases."""

    def __init__(self, provider: GoogleSpeechProvider | None = None) -> None:
        self._provider = provider or GoogleSpeechProvider()
        self._fixed_cache: dict[tuple[str, int, str], bytes] = {}

    async def synthesize(self, text: str) -> bytes:
        cache_key = (STEWART_VOICE, int(STEWART_AUDIO_ENCODING), text)
        if text in FIXED_LIFECYCLE_PHRASES and cache_key in self._fixed_cache:
            return self._fixed_cache[cache_key]

        audio = await self._provider.synthesize(text)
        if text in FIXED_LIFECYCLE_PHRASES:
            self._fixed_cache[cache_key] = audio
        return audio

    async def close(self) -> None:
        await self._provider.close()
