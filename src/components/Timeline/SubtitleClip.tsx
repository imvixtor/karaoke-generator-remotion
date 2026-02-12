import React from 'react';
import type { KaraokeCaption } from '../../types/karaoke';

interface SubtitleClipProps {
    caption: KaraokeCaption;
    zoom: number; // pixels per second
    index: number;
    isSelected: boolean;
    onSelect: (index: number, e?: React.MouseEvent) => void;
    onUpdate: (index: number, newStart: number, newEnd: number) => void;
    minTime: number; // Earliest allowed start time (ms)
    maxTime: number; // Latest allowed end time (ms)
}

const SubtitleClip: React.FC<SubtitleClipProps> = ({
    caption,
    zoom,
    index,
    isSelected,
    onSelect,
    onUpdate,
    minTime,
    maxTime,
}) => {
    const left = (caption.startMs / 1000) * zoom;
    const width = ((caption.endMs - caption.startMs) / 1000) * zoom;

    // Single track, fixed top
    const top = 4;

    const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'left' | 'right') => {
        e.stopPropagation();

        if (type === 'move') {
            if (!isSelected) {
                onSelect(index, e);
                return;
            }
        }
        // If resize handle, isSelected is guaranteed true by render logic


        const startX = e.clientX;
        const originalStart = caption.startMs;
        const originalEnd = caption.endMs;
        const duration = originalEnd - originalStart;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaMs = (deltaX / zoom) * 1000;

            let newStart = originalStart;
            let newEnd = originalEnd;

            if (type === 'move') {
                newStart += deltaMs;
                newEnd += deltaMs;

                // Clamp move
                if (newStart < minTime) {
                    newStart = minTime;
                    newEnd = newStart + duration;
                }
                if (newEnd > maxTime) {
                    newEnd = maxTime;
                    newStart = newEnd - duration;
                }
            } else if (type === 'left') {
                newStart += deltaMs;
                // Clamp left resize
                if (newStart < minTime) newStart = minTime;
                if (newStart > newEnd - 100) newStart = newEnd - 100; // Min duration
            } else if (type === 'right') {
                newEnd += deltaMs;
                // Clamp right resize
                if (newEnd > maxTime) newEnd = maxTime;
                if (newEnd < newStart + 100) newEnd = newStart + 100; // Min duration
            }

            onUpdate(index, Math.round(newStart), Math.round(newEnd));
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            className={`absolute h-12 rounded border text-xs overflow-hidden select-none cursor-pointer flex flex-col justify-center px-2
                ${isSelected
                    ? 'bg-primary/80 border-primary text-primary-foreground z-10 shadow-sm'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}`}
            style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${Math.max(width, 2)}px`, // Min width for visibility
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Left Handle */}
            {isSelected && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize hover:bg-white/20 z-20"
                    onMouseDown={(e) => handleMouseDown(e, 'left')}
                />
            )}

            <div className="truncate pointer-events-none">
                {caption.text}
            </div>

            {/* Right Handle */}
            {isSelected && (
                <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize hover:bg-white/20 z-20"
                    onMouseDown={(e) => handleMouseDown(e, 'right')}
                />
            )}
        </div>
    );
};

export default React.memo(SubtitleClip);
