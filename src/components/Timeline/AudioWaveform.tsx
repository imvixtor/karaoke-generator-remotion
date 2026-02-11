import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

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

    useEffect(() => {
        if (!containerRef.current || !audioUrl) return;

        // Destroy previous instance
        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
            wavesurferRef.current = null;
        }

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#52525b', // zinc-600
            progressColor: '#52525b', // Same color, we handle progress elsewhere
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

        wavesurfer.load(audioUrl);
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
    }, [audioUrl]);

    // Update zoom
    useEffect(() => {
        const ws = wavesurferRef.current;
        if (ws) {
            try {
                ws.zoom(zoom);
            } catch (e) {
                // Ignore "No audio loaded" if it happens during init
                console.warn("WaveSurfer zoom error:", e);
            }
        }
    }, [zoom]);

    return (
        <div ref={containerRef} className="w-full h-16 pointer-events-none overflow-hidden" />
    );
};

export default React.memo(AudioWaveform);
