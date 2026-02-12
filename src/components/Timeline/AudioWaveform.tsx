import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useTheme } from 'next-themes';

interface AudioWaveformProps {
    audioUrl: string | null;
    zoom: number; // pixels per second
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({
    audioUrl,
    zoom,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        if (!containerRef.current || !audioUrl) return;

        // Destroy previous instance
        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
            wavesurferRef.current = null;
        }

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: resolvedTheme === 'dark' ? '#cbd5e1' : '#475569', // Slate-300 (dark mode) / Slate-600 (light mode)
            progressColor: '#16a34a', // Primary Green
            cursorColor: 'transparent',
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 64,
            width: '100%',
            normalize: true,
            minPxPerSec: zoom,
            fillParent: true,
            interact: false,
        });

        wavesurfer.load(audioUrl).catch(err => {
            if (err.name === 'AbortError') return;
            console.error('WaveSurfer load error:', err);
        });
        wavesurferRef.current = wavesurfer;

        return () => {
            if (wavesurferRef.current) {
                try {
                    wavesurferRef.current.destroy();
                } catch (e) {
                    console.error("WaveSurfer destroy error", e);
                }
                wavesurferRef.current = null;
            }
        };
    }, [audioUrl, resolvedTheme]);

    // Update zoom with debounce
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const ws = wavesurferRef.current;
            if (ws) {
                try {
                    ws.zoom(zoom);
                } catch (e) {
                    console.warn("WaveSurfer zoom error:", e);
                }
            }
        }, 100); // 100ms debounce

        return () => clearTimeout(timeoutId);
    }, [zoom]);

    return (
        <div ref={containerRef} className="w-full h-16 pointer-events-none overflow-hidden" />
    );
};

export default React.memo(AudioWaveform);
