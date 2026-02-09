import { useState, useEffect } from 'react';

export function useVideoDuration(videoSrc: string | null): number | null {
    const [duration, setDuration] = useState<number | null>(null);

    useEffect(() => {
        if (!videoSrc) {
            setDuration(null);
            return;
        }
        const video = document.createElement('video');
        video.preload = 'metadata';
        const onLoadedMetadata = () => {
            setDuration(video.duration);
            video.remove();
        };
        const onError = () => {
            setDuration(null);
            video.remove();
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onError);
        video.src = videoSrc;
        return () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onError);
            video.src = '';
        };
    }, [videoSrc]);

    return duration;
}
