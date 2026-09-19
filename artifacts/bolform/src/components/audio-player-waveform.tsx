import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  audioBase64?: string;
  onEnded?: () => void;
  isPlaying?: boolean;
}

export const AudioPlayerWaveform: React.FC<WaveformProps> = ({ audioBase64, onEnded, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const reqFrameRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!audioBase64 || !isPlaying) {
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
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(bufferLength);

        source.connect(analyser);
        analyser.connect(ctx.destination);
        source.start(0);

        sourceRef.current = source;
        analyserRef.current = analyser;

        source.onended = () => {
          if (!isUnmounted && onEnded) {
            onEnded();
          }
        };

        draw();
      } catch (err) {
        console.error('Error decoding audio:', err);
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
  }, [audioBase64, isPlaying, onEnded]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current || !dataArrayRef.current) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    reqFrameRef.current = requestAnimationFrame(draw);
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / dataArrayRef.current.length) * 2.5;
    let x = 0;
    
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const barHeight = dataArrayRef.current[i] / 2;
      ctx.fillStyle = `hsl(175, 40%, ${Math.max(35, 80 - barHeight / 2)}%)`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={50}
      className="w-full h-12 rounded bg-card-foreground/5 opacity-80"
    />
  );
};
