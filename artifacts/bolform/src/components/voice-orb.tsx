import React, { useEffect, useRef } from 'react';
import { Mic, Loader2, AlertCircle, Pause } from 'lucide-react';
import { cn } from '../lib/utils';

export type VoiceState = "idle" | "listening" | "understanding" | "speaking" | "paused" | "error";

interface VoiceOrbProps {
  state: VoiceState;
  audioBase64?: string | null;
  onAudioEnded?: () => void;
  onClick?: () => void;
  className?: string;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ state, audioBase64, onAudioEnded, onClick, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const reqFrameRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const onAudioEndedRef = useRef(onAudioEnded);

  useEffect(() => {
    onAudioEndedRef.current = onAudioEnded;
  }, [onAudioEnded]);

  useEffect(() => {
    if (state !== 'speaking' || !audioBase64) {
      if (sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      return;
    }

    let isUnmounted = false;
    const playAudio = async () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      
      const byteString = atob(audioBase64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }

      try {
        const audioBuffer = await ctx.decodeAudioData(ab);
        if (isUnmounted) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        const bufferLength = analyser.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(bufferLength);

        source.connect(analyser);
        analyser.connect(ctx.destination);
        source.start(0);

        sourceRef.current = source;
        analyserRef.current = analyser;

        source.onended = () => {
          if (!isUnmounted && onAudioEndedRef.current) {
            onAudioEndedRef.current();
          }
        };

        draw();
      } catch (err) {
        console.error('Error decoding audio:', err);
        if (onAudioEndedRef.current) onAudioEndedRef.current();
      }
    };

    playAudio();

    return () => {
      isUnmounted = true;
      if (sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      }
      if (reqFrameRef.current) {
        cancelAnimationFrame(reqFrameRef.current);
      }
    };
  }, [audioBase64, state]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current || !dataArrayRef.current || state !== 'speaking') return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    reqFrameRef.current = requestAnimationFrame(draw);
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const baseRadius = 45;

    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();

    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const value = dataArrayRef.current[i];
      const barHeight = (value / 255) * 35;
      
      const rads = (i * 2 * Math.PI) / dataArrayRef.current.length;
      
      const x1 = centerX + Math.cos(rads) * baseRadius;
      const y1 = centerY + Math.sin(rads) * baseRadius;
      const x2 = centerX + Math.cos(rads) * (baseRadius + barHeight);
      const y2 = centerY + Math.sin(rads) * (baseRadius + barHeight);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + (value / 255) * 0.6})`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  };

  return (
    <div 
      className={cn(
        "relative flex items-center justify-center w-48 h-48 rounded-full transition-all duration-700 select-none",
        (state === 'idle' || state === 'paused') ? 'cursor-pointer hover:scale-105 active:scale-95' : '',
        state === 'listening' ? 'cursor-pointer scale-105 active:scale-95' : '',
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onClick) {
          event.preventDefault();
          onClick();
        }
      }}
      aria-label="Voice Assistant Orb"
    >
      {/* Background layer */}
      <div className={cn(
        "absolute inset-4 rounded-full transition-colors duration-700",
        (state === 'idle' || state === 'paused') ? 'bg-white/10' : '',
        state === 'listening' ? 'bg-primary/30' : '',
        state === 'understanding' ? 'bg-white/10' : '',
        state === 'speaking' ? 'bg-transparent' : '',
        state === 'error' ? 'bg-destructive/20' : ''
      )} />

      {/* Glow effects */}
      {state === 'listening' && (
        <>
          <div className="absolute inset-2 rounded-full border-2 border-primary animate-ping opacity-30 duration-1000" />
          <div className="absolute inset-4 rounded-full border-2 border-primary/50 animate-pulse" />
        </>
      )}
      {state === 'understanding' && (
        <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-white/30 animate-spin duration-1000" />
      )}

      {/* Inner Icon */}
      <div className="relative z-10 flex items-center justify-center pointer-events-none">
        {state === 'idle' && <Mic className="w-10 h-10 text-white/60 transition-colors" />}
        {state === 'paused' && <Pause className="w-10 h-10 text-white/60 transition-colors" />}
        {state === 'listening' && <div className="w-6 h-6 rounded-sm bg-primary animate-pulse" />}
        {state === 'understanding' && <Loader2 className="w-10 h-10 text-white/80 animate-spin" />}
        {state === 'speaking' && (
          <canvas ref={canvasRef} width={200} height={200} className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2" />
        )}
        {state === 'error' && <AlertCircle className="w-10 h-10 text-destructive" />}
      </div>
    </div>
  );
};