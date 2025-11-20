import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isConnected: boolean;
  accentColor?: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ 
  analyser, 
  isConnected, 
  accentColor = '#d4af37' // Default Gold
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const draw = () => {
      if (!ctx || !canvas) return;
      
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      // If not connected or no analyser, draw a dormant state (gentle pulse)
      if (!isConnected || !analyser) {
        const time = Date.now() / 2000;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 50 + Math.sin(time) * 5, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 40 + Math.sin(time * 1.5) * 3, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // Get audio data
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Visualizer Logic: Cinematic Circular Wave
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 4;
      const bars = 64;
      const step = Math.floor(bufferLength / bars);

      ctx.beginPath();
      
      for (let i = 0; i < bars; i++) {
        const value = dataArray[i * step];
        const percent = value / 255;
        const barHeight = radius * 0.5 * percent * 2; // Amplify
        
        const angle = (i / bars) * Math.PI * 2;
        
        // Mirror effect
        const x1 = cx + Math.cos(angle) * (radius + barHeight);
        const y1 = cy + Math.sin(angle) * (radius + barHeight);
        const x2 = cx + Math.cos(angle) * (radius - barHeight * 0.3); // Inner shift
        const y2 = cy + Math.sin(angle) * (radius - barHeight * 0.3);

        ctx.moveTo(x2, y2);
        ctx.lineTo(x1, y1);
      }

      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = accentColor;
      ctx.shadowBlur = 15;
      ctx.shadowColor = accentColor;
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow for performance

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [analyser, isConnected, accentColor]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
    />
  );
};

export default Visualizer;