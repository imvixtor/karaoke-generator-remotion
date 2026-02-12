import React, { useRef, useCallback, useEffect } from 'react';
import AudioWaveform from './AudioWaveform';
import SubtitleTrack from './SubtitleTrack';
import type { KaraokeCaption } from '../../types/karaoke';
import { PlayerRef } from '@remotion/player';
import { useSyncExternalStore } from 'react';

// Reuse the hook logic here or import it if exported.
// Since it was defined in page.tsx and not exported, I'll redefine it here or move it to a hooks file.
// Ideally move to hooks/useCurrentPlayerFrame.ts but for speed I'll inline a simplified version or assume user can export it.
// Checking page.tsx, it's not exported. I'll define a local version.

const useTimelinePlayerFrame = (player: PlayerRef | null) => {
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            if (!player) return () => undefined;
            const updater = () => onStoreChange();
            player.addEventListener('frameupdate', updater);
            return () => player.removeEventListener('frameupdate', updater);
        },
        [player],
    );

    return useSyncExternalStore(
        subscribe,
        () => player?.getCurrentFrame() ?? 0,
        () => 0,
    );
};

interface TimelineProps {
    audioUrl: string | null;
    captions: KaraokeCaption[];
    player: PlayerRef | null;
    duration: number; // in seconds
    onUpdateCaption: (index: number, caption: KaraokeCaption) => void;
    selectedIndexes: number[];
    onSelect: (indexes: number[]) => void;
    zoom: number;
    onZoom: (newZoom: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({
    audioUrl,
    captions,
    player,
    duration,
    onUpdateCaption,
    selectedIndexes,
    onSelect,
    zoom,
    onZoom,
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const pendingScrollLeft = useRef<number | null>(null);

    // FPS constant - assuming 30 as per page.tsx default
    const FPS = 30;

    const currentFrame = useTimelinePlayerFrame(player);
    const currentTime = currentFrame / FPS;

    // Zoom constraints
    // const minZoom = 10;
    // const maxZoom = 200;

    // const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, maxZoom));
    // const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, minZoom));

    // Calculate total width
    const totalWidth = duration * zoom;

    const onSeek = useCallback((time: number) => {
        if (player) {
            player.seekTo(time * FPS);
        }
    }, [player]);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Find click position relative to container content
        if (!scrollContainerRef.current) return;
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
        const time = offsetX / zoom;

        onSeek(time);
        onSelect([]); // Deselect all when clicking empty space

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!scrollContainerRef.current) return;
            const moveRect = scrollContainerRef.current.getBoundingClientRect();

            // Calculate new time based on mouse position relative to container content
            const currentGenericOffsetX = moveEvent.clientX - moveRect.left + scrollContainerRef.current.scrollLeft;
            const newTime = Math.max(0, currentGenericOffsetX / zoom);

            onSeek(newTime);
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleUpdate = useCallback((index: number, newStart: number, newEnd: number) => {
        const caps = [...captions];
        if (!caps[index]) return;
        const updated = { ...caps[index], startMs: newStart, endMs: newEnd };
        onUpdateCaption(index, updated);
    }, [captions, onUpdateCaption]);

    // Playhead position
    const playheadLeft = currentTime * zoom;

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                // Zooming
                e.preventDefault();
                e.stopPropagation();

                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const scrollLeft = container.scrollLeft;
                const contentX = scrollLeft + mouseX;

                const timeAtCursor = contentX / zoom;

                // Linear zoom with fixed steps logic
                // Standard mouse wheel delta is ~100. We want that to correspond to a step of 10.
                // Trackpads produce smaller deltas, which will result in proportional smaller steps.
                const zoomFactor = 0.1;
                let newZoom = zoom - (e.deltaY * zoomFactor);

                // Clamp
                newZoom = Math.max(10, Math.min(200, newZoom));

                // Round to nearest integer to avoid messy decimals
                newZoom = Math.round(newZoom);

                if (newZoom !== zoom) {
                    // Calculate expected new scrollLeft to keep timeAtCursor under mouseX
                    // newScrollLeft + mouseX = timeAtCursor * newZoom
                    const newScrollLeft = (timeAtCursor * newZoom) - mouseX;
                    pendingScrollLeft.current = newScrollLeft;
                    onZoom(newZoom);
                }
            } else {
                // Horizontal scrolling with vertical wheel
                if (!e.shiftKey) {
                    container.scrollLeft += e.deltaY;
                }
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, [zoom, onZoom]);

    // Restore scroll position after zoom update
    React.useLayoutEffect(() => {
        if (pendingScrollLeft.current !== null && scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = pendingScrollLeft.current;
            pendingScrollLeft.current = null;
        }
    }, [zoom]);

    return (
        <div className="flex flex-col bg-background border-none rounded-none h-full min-h-0 select-none">
            {/* Scrollable Area */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar divide-y divide-border min-h-0"
                onMouseDown={handleMouseDown}
            >
                <div style={{ width: `${Math.max(totalWidth, scrollContainerRef.current?.clientWidth || 0)}px`, position: 'relative', height: '100%' }}>
                    {/* Ruler */}
                    {React.useMemo(() => (
                        <div className="h-8 border-b border-border flex relative text-[10px] text-muted-foreground bg-secondary/30 pointer-events-none">
                            {Array.from({ length: Math.ceil(duration) }).map((_, sec) => {
                                if (sec % 5 !== 0) return null; // Show every 5s
                                return (
                                    <div key={sec} className="absolute top-0 bottom-0 border-l border-border pl-1" style={{ left: `${sec * zoom}px` }}>
                                        {sec}s
                                    </div>
                                );
                            })}
                        </div>
                    ), [duration, zoom])}

                    {/* Tracks */}
                    <div className="relative flex-1 min-h-[200px]">
                        {/* Audio Waveform Track */}
                        <div className="h-20 border-b border-border relative bg-secondary/10 overflow-hidden group flex items-center">
                            <AudioWaveform audioUrl={audioUrl} zoom={zoom} />
                            <div className="absolute top-1 left-2 text-[10px] uppercase font-bold text-muted-foreground group-hover:text-foreground transition-colors pointer-events-none bg-background/50 px-1 rounded z-10">Audio</div>
                        </div>

                        {/* Subtitle Track */}
                        <div
                            className="relative py-4 h-32"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <SubtitleTrack
                                captions={captions}
                                zoom={zoom}
                                selectedIndexes={selectedIndexes}
                                onSelect={onSelect}
                                onUpdate={handleUpdate}
                            />
                            <div className="absolute top-1 left-2 text-[10px] uppercase font-bold text-muted-foreground pointer-events-none bg-background/50 px-1 rounded">Subtitles</div>
                        </div>

                        {/* Playhead */}
                        <div
                            className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-50 flex flex-col items-center"
                            style={{ left: `${playheadLeft}px` }}
                        >
                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 -ml-[0px]"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Timeline;
