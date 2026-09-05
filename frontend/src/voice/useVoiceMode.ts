import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WriterRoomEventBatch } from "../model/events";
import {
  BrowserSpeechQueue,
  detectVoiceCapabilities,
  LANDING_WELCOME_SPEECH,
  VoiceAnnouncementMapper,
  type BrowserSpeechRecognition,
  type BrowserSpeechRecognitionErrorEvent,
  type BrowserSpeechRecognitionEvent,
  type ConversationMode,
  type HostedSpeechRequest,
  type VoiceInteractionState,
} from "./browserVoice";

const PERMISSION_ERROR = "Microphone access was denied. You can continue in Text mode.";
const NO_SPEECH_ERROR = "No speech was recognized. Try again or continue in Text mode.";
const RECOGNITION_ERROR = "Voice recognition could not complete. Try again or continue in Text mode.";

export interface VoiceModeController {
  mode: ConversationMode;
  available: boolean;
  state: VoiceInteractionState;
  finalTranscript: string;
  interimTranscript: string;
  error?: string;
  analyser?: AnalyserNode;
  workspaceTransitionPending: boolean;
  setMode(mode: ConversationMode): void;
  toggleListening(): Promise<void>;
  clearTranscript(): void;
  beginInitialTransition(): void;
  prepareEvents(events: WriterRoomEventBatch): void;
  observeEvents(events: WriterRoomEventBatch): void;
  completeTurn(): void;
  handleTurnError(): void;
}

export function useVoiceMode(requestHostedSpeech?: HostedSpeechRequest): VoiceModeController {
  const capabilities = useMemo(() => detectVoiceCapabilities(), []);
  const initialMode: ConversationMode = capabilities.available ? "voice" : "text";
  const [mode, setModeState] = useState<ConversationMode>(initialMode);
  const [state, setState] = useState<VoiceInteractionState>("ready");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string>();
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  const [workspaceTransitionPending, setWorkspaceTransitionPending] = useState(false);

  const modeRef = useRef<ConversationMode>(initialMode);
  const stateRef = useRef<VoiceInteractionState>("ready");
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const recognitionRef = useRef<BrowserSpeechRecognition | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | undefined>(undefined);
  const recognitionFailedRef = useRef(false);
  const announcementMapperRef = useRef(new VoiceAnnouncementMapper());
  const speechQueueRef = useRef<BrowserSpeechQueue | undefined>(undefined);
  const initialTransitionArmedRef = useRef(false);
  const investigationBoundaryInFlightRef = useRef(false);
  const hostedSpeechRef = useRef(requestHostedSpeech);
  const landingWelcomePendingRef = useRef(false);
  const landingWelcomeScheduledRef = useRef(false);
  const microphoneAfterWelcomeRef = useRef(false);
  const startListeningRef = useRef<(() => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    hostedSpeechRef.current = requestHostedSpeech;
  }, [requestHostedSpeech]);

  const updateState = useCallback((next: VoiceInteractionState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const releaseWorkspaceTransition = useCallback(() => {
    initialTransitionArmedRef.current = false;
    investigationBoundaryInFlightRef.current = false;
    setWorkspaceTransitionPending(false);
  }, []);

  const ensureSpeechQueue = useCallback((): BrowserSpeechQueue | undefined => {
    if (!capabilities.available) return undefined;
    if (!speechQueueRef.current) {
      speechQueueRef.current = new BrowserSpeechQueue({
        synthesis: window.speechSynthesis,
        utterance: window.SpeechSynthesisUtterance,
        hosted: requestHostedSpeech
          ? {
              request: (text, signal) => {
                const request = hostedSpeechRef.current;
                return request
                  ? request(text, signal)
                  : Promise.reject(new Error("Hosted speech is unavailable."));
              },
              createAudio: (source) => new Audio(source),
              createObjectURL: (audio) => URL.createObjectURL(audio),
              revokeObjectURL: (source) => URL.revokeObjectURL(source),
            }
          : undefined,
        onSpeakingChange: (speaking) => {
          if (modeRef.current !== "voice") return;
          if (speaking) updateState("speaking");
          else if (stateRef.current === "speaking") updateState("ready");
        },
        onItemSettled: (item) => {
          if (item.presentationBoundary === "landing-welcome") {
            landingWelcomePendingRef.current = false;
            const shouldStartListening =
              microphoneAfterWelcomeRef.current && modeRef.current === "voice";
            microphoneAfterWelcomeRef.current = false;
            if (shouldStartListening) {
              void startListeningRef.current?.();
            }
          }
          if (item.presentationBoundary === "investigation-start") {
            releaseWorkspaceTransition();
          }
        },
      });
    }
    return speechQueueRef.current;
  }, [capabilities.available, releaseWorkspaceTransition, requestHostedSpeech, updateState]);

  const releaseMicrophone = useCallback(() => {
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    const context = audioContextRef.current;
    audioContextRef.current = undefined;
    if (context && context.state !== "closed") void context.close();
    setAnalyser(undefined);
  }, []);

  const stopRecognition = useCallback(
    (discard: boolean) => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognitionRef.current = undefined;
      if (discard) recognition.abort();
      else recognition.stop();
      releaseMicrophone();
    },
    [releaseMicrophone],
  );

  const cancelVoiceOutput = useCallback(() => {
    ensureSpeechQueue()?.cancelAndClear();
  }, [ensureSpeechQueue]);

  const setMode = useCallback(
    (next: ConversationMode) => {
      if (next === "voice" && !capabilities.available) return;
      if (next === modeRef.current) {
        if (landingWelcomePendingRef.current) {
          ensureSpeechQueue()?.resumeAfterUserActivation();
        }
        return;
      }
      if (next === "text") {
        microphoneAfterWelcomeRef.current = false;
        cancelVoiceOutput();
        stopRecognition(true);
        releaseWorkspaceTransition();
        setError(undefined);
        updateState("ready");
      }
      modeRef.current = next;
      setModeState(next);
      if (next === "voice") {
        ensureSpeechQueue();
        setError(undefined);
        updateState("ready");
      }
    },
    [
      cancelVoiceOutput,
      capabilities.available,
      ensureSpeechQueue,
      releaseWorkspaceTransition,
      stopRecognition,
      updateState,
    ],
  );

  const clearTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setFinalTranscript("");
    setInterimTranscript("");
    setError(undefined);
    if (modeRef.current === "voice" && stateRef.current !== "speaking") updateState("ready");
  }, [updateState]);

  const recognitionErrorMessage = useCallback(
    (event: BrowserSpeechRecognitionErrorEvent): string => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        return PERMISSION_ERROR;
      }
      if (event.error === "no-speech" || event.error === "audio-capture") {
        return NO_SPEECH_ERROR;
      }
      return RECOGNITION_ERROR;
    },
    [],
  );

  const startListening = useCallback(async () => {
    if (!capabilities.available || !capabilities.recognition || !capabilities.audioContext) return;
    cancelVoiceOutput();
    updateState("processing");
    setError(undefined);
    recognitionFailedRef.current = false;
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setFinalTranscript("");
    setInterimTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (modeRef.current !== "voice") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const audioContext = new capabilities.audioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const nextAnalyser = audioContext.createAnalyser();
      nextAnalyser.fftSize = 64;
      nextAnalyser.smoothingTimeConstant = 0.72;
      source.connect(nextAnalyser);
      audioSourceRef.current = source;
      setAnalyser(nextAnalyser);

      const recognition = new capabilities.recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onstart = () => updateState("listening");
      recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
        const finalParts: string[] = [];
        const interimParts: string[] = [];
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) finalParts.push(transcript);
          else interimParts.push(transcript);
        }
        finalTranscriptRef.current = finalParts.join(" ").trim();
        interimTranscriptRef.current = interimParts.join(" ").trim();
        setFinalTranscript(finalTranscriptRef.current);
        setInterimTranscript(interimTranscriptRef.current);
      };
      recognition.onnomatch = () => {
        recognitionFailedRef.current = true;
        setError(NO_SPEECH_ERROR);
        updateState("error");
        releaseMicrophone();
        recognition.stop();
      };
      recognition.onerror = (event) => {
        recognitionFailedRef.current = true;
        setError(recognitionErrorMessage(event));
        updateState("error");
        releaseMicrophone();
      };
      recognition.onend = () => {
        recognitionRef.current = undefined;
        releaseMicrophone();
        if (recognitionFailedRef.current || modeRef.current !== "voice") return;
        if (!finalTranscriptRef.current) {
          setError(NO_SPEECH_ERROR);
          updateState("error");
          return;
        }
        interimTranscriptRef.current = "";
        setInterimTranscript("");
        updateState("ready");
      };
      recognition.start();
    } catch (caught) {
      releaseMicrophone();
      const denied = caught instanceof DOMException && caught.name === "NotAllowedError";
      setError(denied ? PERMISSION_ERROR : RECOGNITION_ERROR);
      updateState("error");
    }
  }, [
    cancelVoiceOutput,
    capabilities,
    recognitionErrorMessage,
    releaseMicrophone,
    updateState,
  ]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const toggleListening = useCallback(async () => {
    if (landingWelcomePendingRef.current) {
      microphoneAfterWelcomeRef.current = true;
      ensureSpeechQueue()?.resumeAfterUserActivation();
      return;
    }
    if (stateRef.current === "listening") {
      updateState("processing");
      stopRecognition(false);
      return;
    }
    await startListening();
  }, [ensureSpeechQueue, startListening, stopRecognition, updateState]);

  useEffect(() => {
    if (
      !requestHostedSpeech ||
      !capabilities.available ||
      landingWelcomeScheduledRef.current
    ) {
      return;
    }
    landingWelcomeScheduledRef.current = true;
    landingWelcomePendingRef.current = true;
    ensureSpeechQueue()?.enqueue([
      {
        id: "landing-welcome",
        text: LANDING_WELCOME_SPEECH,
        presentationBoundary: "landing-welcome",
      },
    ]);
  }, [capabilities.available, ensureSpeechQueue, requestHostedSpeech]);

  const beginInitialTransition = useCallback(() => {
    if (modeRef.current !== "voice" || !capabilities.available) return;
    initialTransitionArmedRef.current = true;
    setWorkspaceTransitionPending(true);
  }, [capabilities.available]);

  const prepareEvents = useCallback(
    (events: WriterRoomEventBatch) => {
      if (modeRef.current !== "voice") return;
      if (events.some((event) => event.type === "investigation_started")) {
        if (initialTransitionArmedRef.current) {
          initialTransitionArmedRef.current = false;
          investigationBoundaryInFlightRef.current = true;
        }
        return;
      }
      if (
        initialTransitionArmedRef.current &&
        events.some(
          (event) =>
            event.type === "stewart_message" && Boolean(event.message.needsWriterInput),
        )
      ) {
        releaseWorkspaceTransition();
      }
    },
    [releaseWorkspaceTransition],
  );

  const observeEvents = useCallback(
    (events: WriterRoomEventBatch) => {
      const speechItems = announcementMapperRef.current.map(events);
      if (modeRef.current !== "voice") return;
      ensureSpeechQueue()?.enqueue(speechItems);
    },
    [ensureSpeechQueue],
  );

  const completeTurn = useCallback(() => {
    if (initialTransitionArmedRef.current && !investigationBoundaryInFlightRef.current) {
      releaseWorkspaceTransition();
    }
  }, [releaseWorkspaceTransition]);

  const handleTurnError = useCallback(() => {
    releaseWorkspaceTransition();
    if (modeRef.current === "voice") {
      cancelVoiceOutput();
      updateState("error");
    }
  }, [cancelVoiceOutput, releaseWorkspaceTransition, updateState]);

  useEffect(
    () => () => {
      speechQueueRef.current?.dispose();
      speechQueueRef.current = undefined;
      landingWelcomePendingRef.current = false;
      landingWelcomeScheduledRef.current = false;
      microphoneAfterWelcomeRef.current = false;
      recognitionRef.current?.abort();
      releaseMicrophone();
    },
    [releaseMicrophone],
  );

  return {
    mode,
    available: capabilities.available,
    state,
    finalTranscript,
    interimTranscript,
    error,
    analyser,
    workspaceTransitionPending,
    setMode,
    toggleListening,
    clearTranscript,
    beginInitialTransition,
    prepareEvents,
    observeEvents,
    completeTurn,
    handleTurnError,
  };
}
