import { useState, useEffect } from 'react';

export function useAudioDuration(audioSrc: string | null): number | null {
    const [duration, setDuration] = useState<number | null>(null);

    useEffect(() => {
        if (!audioSrc) {
            setDuration(null);
            return;
        }
        const audio = new Audio(audioSrc);
        const onLoadedMetadata = () => setDuration(audio.duration);
        const onError = () => setDuration(null);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('error', onError);
        audio.load();
        return () => {
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('error', onError);
            audio.src = '';
        };
    }, [audioSrc]);

    return duration;
}
