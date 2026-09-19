import { useState, useRef, useCallback, useEffect } from 'react';

export const useAudioRecorder = (
  onStop: (blob: Blob) => void,
  onError: (err: Error) => void,
  maxSeconds = 25,
  realtime?: {
    language: string;
    onInterimTranscript?: (text: string) => void;
    onFinalTranscript: (text: string) => void;
  }
) => {
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(maxSeconds);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const cancelRef = useRef(false);
  const vadFrame = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const speechRecognition = useRef<any>(null);
  const realtimeHandled = useRef(false);

  const startRecording = useCallback(async () => {
    try {
      cancelRef.current = false;
      realtimeHandled.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContext.current = context;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (vadFrame.current !== null) cancelAnimationFrame(vadFrame.current);
        vadFrame.current = null;
        void audioContext.current?.close();
        audioContext.current = null;
        speechRecognition.current?.abort();
        speechRecognition.current = null;
        if (!cancelRef.current) {
          const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
          onStop(blob);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setTimeLeft(maxSeconds);

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition && realtime) {
        const recognition = new SpeechRecognition();
        recognition.lang = realtime.language;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event: any) => {
          let interim = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = String(result[0]?.transcript ?? "").trim();
            if (!transcript) continue;
            if (result.isFinal && !realtimeHandled.current) {
              realtimeHandled.current = true;
              cancelRef.current = true;
              realtime.onFinalTranscript(transcript);
              if (recorder.state !== "inactive") recorder.stop();
              if (timer.current) clearInterval(timer.current);
              setIsRecording(false);
              return;
            }
            interim = `${interim} ${transcript}`.trim();
          }
          if (interim) realtime.onInterimTranscript?.(interim);
        };
        recognition.onerror = () => {
          speechRecognition.current = null;
        };
        speechRecognition.current = recognition;
        try {
          recognition.start();
        } catch {
          speechRecognition.current = null;
        }
      }

      const levels = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
      const startedAt = performance.now();
      let speechStarted = false;
      let silentSince: number | null = null;
      const detectSilence = () => {
        if (recorder.state === "inactive") return;
        analyser.getByteTimeDomainData(levels);
        let sum = 0;
        for (const level of levels) {
          const normalized = (level - 128) / 128;
          sum += normalized * normalized;
        }
        const volume = Math.sqrt(sum / levels.length);
        const now = performance.now();
        if (volume > 0.025) {
          speechStarted = true;
          silentSince = null;
        } else if (speechStarted) {
          silentSince ??= now;
          if (now - silentSince > 1200 && now - startedAt > 1000) {
            recorder.stop();
            if (timer.current) clearInterval(timer.current);
            setIsRecording(false);
            return;
          }
        }
        vadFrame.current = requestAnimationFrame(detectSilence);
      };
      vadFrame.current = requestAnimationFrame(detectSilence);

      timer.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Error starting audio recording:', err);
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [maxSeconds, onStop, onError, realtime]);

  const stopRecording = useCallback((cancel = false) => {
    cancelRef.current = cancel;
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    if (timer.current) {
      clearInterval(timer.current);
    }
    if (vadFrame.current !== null) {
      cancelAnimationFrame(vadFrame.current);
      vadFrame.current = null;
    }
    speechRecognition.current?.abort();
    speechRecognition.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (vadFrame.current !== null) cancelAnimationFrame(vadFrame.current);
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        cancelRef.current = true;
        mediaRecorder.current.stop();
      }
      void audioContext.current?.close();
    };
  }, []);

  return { isRecording, startRecording, stopRecording, timeLeft };
};
