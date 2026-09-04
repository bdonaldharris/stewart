import asyncio
from unittest.mock import AsyncMock, Mock

import pytest
from google.api_core import exceptions as google_exceptions
from google.cloud import texttospeech_v1 as texttospeech

from stewart.speech import (
    FIXED_LIFECYCLE_PHRASES,
    STEWART_AUDIO_ENCODING,
    STEWART_LANGUAGE_CODE,
    STEWART_SPEECH_TIMEOUT_SECONDS,
    STEWART_VOICE,
    GoogleSpeechProvider,
    SpeechFailureKind,
    SpeechProviderError,
    StewartSpeechSynthesizer,
)


def _client(*, audio: bytes = b"mp3-audio", error: Exception | None = None) -> Mock:
    client = Mock()
    if error is None:
        client.synthesize_speech = AsyncMock(
            return_value=texttospeech.SynthesizeSpeechResponse(audio_content=audio)
        )
    else:
        client.synthesize_speech = AsyncMock(side_effect=error)
    client.transport = Mock()
    client.transport.close = Mock(return_value=None)
    return client


def test_google_provider_uses_locked_voice_mp3_timeout_and_adc_client() -> None:
    client = _client()
    client_factory = Mock(return_value=client)
    provider = GoogleSpeechProvider(client_factory=client_factory)

    audio = asyncio.run(provider.synthesize("Stewart response."))

    assert audio == b"mp3-audio"
    client_factory.assert_called_once_with()
    call = client.synthesize_speech.await_args
    request = call.kwargs["request"]
    assert request.input.text == "Stewart response."
    assert request.voice.name == STEWART_VOICE == "en-GB-Neural2-B"
    assert request.voice.language_code == STEWART_LANGUAGE_CODE == "en-GB"
    assert request.audio_config.audio_encoding == STEWART_AUDIO_ENCODING
    assert call.kwargs["timeout"] == STEWART_SPEECH_TIMEOUT_SECONDS == 5.0


def test_google_provider_closes_the_async_client_transport() -> None:
    client = _client()
    provider = GoogleSpeechProvider(client_factory=Mock(return_value=client))

    asyncio.run(provider.synthesize("Stewart response."))
    asyncio.run(provider.close())

    client.transport.close.assert_called_once_with()


@pytest.mark.parametrize(
    ("provider_error", "expected_kind"),
    [
        (google_exceptions.Unauthenticated("auth"), SpeechFailureKind.PERMISSION),
        (google_exceptions.PermissionDenied("permission"), SpeechFailureKind.PERMISSION),
        (google_exceptions.ResourceExhausted("quota"), SpeechFailureKind.QUOTA),
        (google_exceptions.DeadlineExceeded("timeout"), SpeechFailureKind.TIMEOUT),
        (google_exceptions.ServiceUnavailable("provider"), SpeechFailureKind.UNAVAILABLE),
    ],
)
def test_google_provider_categorizes_expected_provider_failures(
    provider_error: Exception,
    expected_kind: SpeechFailureKind,
) -> None:
    provider = GoogleSpeechProvider(client_factory=Mock(return_value=_client(error=provider_error)))

    with pytest.raises(SpeechProviderError) as caught:
        asyncio.run(provider.synthesize("Stewart response."))

    assert caught.value.kind is expected_kind


def test_google_provider_keeps_internal_defects_visible() -> None:
    provider = GoogleSpeechProvider(
        client_factory=Mock(return_value=_client(error=ValueError("application defect")))
    )

    with pytest.raises(ValueError, match="application defect"):
        asyncio.run(provider.synthesize("Stewart response."))


def test_fixed_lifecycle_phrase_is_cached_by_voice_encoding_and_text() -> None:
    provider = Mock()
    provider.synthesize = AsyncMock(return_value=b"fixed-audio")
    provider.close = AsyncMock()
    synthesizer = StewartSpeechSynthesizer(provider=provider)
    phrase = next(iter(FIXED_LIFECYCLE_PHRASES))

    first = asyncio.run(synthesizer.synthesize(phrase))
    second = asyncio.run(synthesizer.synthesize(phrase))

    assert first == second == b"fixed-audio"
    provider.synthesize.assert_awaited_once_with(phrase)


def test_dynamic_stewart_messages_are_not_cached() -> None:
    provider = Mock()
    provider.synthesize = AsyncMock(side_effect=[b"first", b"second"])
    provider.close = AsyncMock()
    synthesizer = StewartSpeechSynthesizer(provider=provider)

    first = asyncio.run(synthesizer.synthesize("Who is the falling out between?"))
    second = asyncio.run(synthesizer.synthesize("Who is the falling out between?"))

    assert first == b"first"
    assert second == b"second"
    assert provider.synthesize.await_count == 2
