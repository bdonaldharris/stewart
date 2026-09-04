import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WriterRoomEventBatch } from "../model/events";
import {
  BrowserSpeechQueue,
  detectVoiceCapabilities,
  VoiceAnnouncementMapper,
  type BrowserSpeechRecognition,
  type BrowserSpeechRecognitionErrorEvent,
  type BrowserSpeechRecognitionEvent,
  type ConversationMode,
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
  setMode(mode: ConversationMode): void;
  toggleListening(): Promise<void>;
  clearTranscript(): void;
  observeEvents(events: WriterRoomEventBatch): void;
  handleTurnError(): void;
}

export function useVoiceMode(): VoiceModeController {
  const capabilities = useMemo(() => detectVoiceCapabilities(), []);
  const [mode, setModeState] = useState<ConversationMode>("text");
  const [state, setState] = useState<VoiceInteractionState>("ready");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string>();
  const [analyser, setAnalyser] = useState<AnalyserNode>();

  const modeRef = useRef<ConversationMode>("text");
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

  const updateState = useCallback((next: VoiceInteractionState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const ensureSpeechQueue = useCallback((): BrowserSpeechQueue | undefined => {
    if (!capabilities.available) return undefined;
    if (!speechQueueRef.current) {
      speechQueueRef.current = new BrowserSpeechQueue({
        synthesis: window.speechSynthesis,
        utterance: window.SpeechSynthesisUtterance,
        onSpeakingChange: (speaking) => {
          if (modeRef.current !== "voice") return;
          if (speaking) updateState("speaking");
          else if (stateRef.current === "speaking") updateState("ready");
        },
      });
    }
    return speechQueueRef.current;
  }, [capabilities.available, updateState]);

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
      if (next === modeRef.current) return;
      if (next === "text") {
        cancelVoiceOutput();
        stopRecognition(true);
        setError(undefined);
        updateState("ready");
      }
      modeRef.current = next;
      setModeState(next);
      if (next === "voice") {
        setError(undefined);
        updateState("ready");
      }
    },
    [cancelVoiceOutput, capabilities.available, stopRecognition, updateState],
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

  const toggleListening = useCallback(async () => {
    if (stateRef.current === "listening") {
      updateState("processing");
      stopRecognition(false);
      return;
    }
    await startListening();
  }, [startListening, stopRecognition, updateState]);

  const observeEvents = useCallback(
    (events: WriterRoomEventBatch) => {
      const speechItems = announcementMapperRef.current.map(events);
      if (modeRef.current !== "voice") return;
      ensureSpeechQueue()?.enqueue(speechItems);
    },
    [ensureSpeechQueue],
  );

  const handleTurnError = useCallback(() => {
    if (modeRef.current !== "voice") return;
    cancelVoiceOutput();
    updateState("error");
  }, [cancelVoiceOutput, updateState]);

  useEffect(
    () => () => {
      speechQueueRef.current?.cancelAndClear();
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
    setMode,
    toggleListening,
    clearTranscript,
    observeEvents,
    handleTurnError,
  };
}
