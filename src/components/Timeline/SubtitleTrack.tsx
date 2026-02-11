import React, { useMemo } from 'react';
import type { KaraokeCaption } from '../../types/karaoke';
import SubtitleClip from './SubtitleClip';

interface SubtitleTrackProps {
    captions: KaraokeCaption[];
    zoom: number;
    selectedIndexes: number[];
    onSelect: (indexes: number[]) => void;
    onUpdate: (index: number, newStart: number, newEnd: number) => void;
}

const SubtitleTrack: React.FC<SubtitleTrackProps> = ({
    captions,
    zoom,
    selectedIndexes,
    onSelect,
    onUpdate,
}) => {
    // 1. Sort captions to determine neighbors
    // We attach originalIndex so we can call onUpdate with the correct ID
    const sortedCaptions = useMemo(() => {
        return captions
            .map((c, i) => ({ ...c, originalIndex: i }))
            .sort((a, b) => a.startMs - b.startMs);
    }, [captions]);

    const handleSelect = (index: number, isMulti: boolean) => {
        if (isMulti) {
            if (selectedIndexes.includes(index)) {
                onSelect(selectedIndexes.filter(i => i !== index));
            } else {
                onSelect([...selectedIndexes, index]);
            }
        } else {
            onSelect([index]);
        }
    };

    return (
        <div
            className="relative w-full bg-zinc-900 border-b border-zinc-800 transition-all duration-300"
            style={{ height: '64px' }} // Fixed height for single track
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onSelect([]);
                }
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {sortedCaptions.map((caption, i) => {
                // Determine constraints based on neighbors
                const prevCaption = sortedCaptions[i - 1];
                const nextCaption = sortedCaptions[i + 1];

                const minTime = prevCaption ? prevCaption.endMs : 0;
                // If there is no next caption, we can go indefinitely (or limit to some max)

                const maxTime = nextCaption ? nextCaption.startMs : 86400000;

                return (
                    <SubtitleClip
                        key={caption.originalIndex}
                        index={caption.originalIndex}
                        caption={caption}
                        zoom={zoom}
                        isSelected={selectedIndexes.includes(caption.originalIndex)}
                        onSelect={(idx, e) => handleSelect(idx, e?.ctrlKey || e?.metaKey || false)}
                        onUpdate={onUpdate}
                        minTime={minTime}
                        maxTime={maxTime}
                    />
                );
            })}
        </div>
    );
};

export default React.memo(SubtitleTrack);
