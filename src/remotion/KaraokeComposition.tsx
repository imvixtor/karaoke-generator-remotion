import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, Img, Video, Freeze } from 'remotion';
import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadLora } from '@remotion/google-fonts/Lora';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadPlayfairDisplay } from '@remotion/google-fonts/PlayfairDisplay';
import type { KaraokeCompositionProps, KaraokeCaption } from '../types/karaoke';

const { fontFamily: interTight } = loadInterTight();
const { fontFamily: roboto } = loadRoboto();
const { fontFamily: lora } = loadLora();
const { fontFamily: montserrat } = loadMontserrat();
const { fontFamily: oswald } = loadOswald();
const { fontFamily: playfairDisplay } = loadPlayfairDisplay();

const fontMap: Record<string, string> = {
    'Roboto': roboto,
    'Inter Tight': interTight,
    'Lora': lora,
    'Montserrat': montserrat,
    'Oswald': oswald,
    'Playfair Display': playfairDisplay,
    'Arial': 'Arial, sans-serif',
    'Times New Roman': '"Times New Roman", Times, serif',
};

/** Hiển thị một dòng phụ đề với hiệu ứng karaoke (chữ đã hát đổi màu) */
function KaraokeSubtitleLine({
    caption,
    frameMs,
    sungColor,
    unsungColor,
    fontSize,
    opacity,
    scale,
    enableShadow,
    fontFamily,
}: {
    caption: KaraokeCaption;
    frameMs: number;
    sungColor: string;
    unsungColor: string;
    fontSize: number;
    opacity: number;
    scale: number;
    enableShadow: boolean;
    fontFamily: string;
}) {
    const { startMs, endMs, text } = caption;
    const durationMs = endMs - startMs;
    const progress = durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (frameMs - startMs) / durationMs));

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '20px 80px',
                whiteSpace: 'pre-wrap',
                textAlign: 'center',
                fontFamily: fontFamily, // Use the passed font family
                fontWeight: 'bold',
                fontSize: fontSize * scale,
                lineHeight: 1.4,
                textShadow: enableShadow ? '0 3px 16px rgba(0,0,0,0.85)' : undefined,
                opacity,
                transform: `scale(1)`,
                willChange: 'opacity, transform',
            }}
        >
            {caption.segments && caption.segments.length > 0 ? (
                <span style={{ color: unsungColor }}>
                    {caption.segments.map((seg, idx) => {
                        const segProgress =
                            seg.endMs <= seg.startMs
                                ? 1
                                : Math.min(
                                    1,
                                    Math.max(0, (frameMs - seg.startMs) / (seg.endMs - seg.startMs))
                                );
                        const isSegSung = segProgress >= 1;
                        return (
                            <span
                                key={idx}
                                style={{ color: isSegSung ? sungColor : unsungColor, marginRight: 4 }}
                            >
                                {seg.text}
                            </span>
                        );
                    })}
                </span>
            ) : (
                <span style={{ color: unsungColor }}>
                    {text.split('').map((char, i) => {
                        const charProgress = (i + 1) / text.length;
                        const isSung = progress >= charProgress;
                        return (
                            <span key={i} style={{ color: isSung ? sungColor : unsungColor }}>
                                {char}
                            </span>
                        );
                    })}
                </span>
            )}
        </div>
    );
}

export const KaraokeComposition: React.FC<KaraokeCompositionProps> = ({
    audioSrc,
    captions,
    backgroundType,
    backgroundSrc,
    backgroundDim = 0.60,
    backgroundBlur = 0,
    backgroundVideoStartTime = 0,
    backgroundVideoDuration,
    sungColor = '#00ff88',
    unsungColor = '#ffffff',
    fontSize = 65,
    enableShadow = true,
    fps,
    lyricsLayout = 'bottom',
    fontFamily = 'Roboto', // Default font
}) => {
    const frame = useCurrentFrame();
    const frameMs = (frame / fps) * 1000;
    const { durationInFrames } = useVideoConfig();

    // Map the font name string to the actual loaded font family value
    const activeFontFamily = fontMap[fontFamily] || roboto;

    // 2. Traditional & Bottom Layouts (Fixed slots)
    // Logic: Slot 1 (Even lines), Slot 2 (Odd lines)

    // Logic: 
    // - Always show 2 lines: The current one being sung, and the next one.
    // - When Line K starts:
    //   - It effectively replaces Line K-2 in its slot.
    //   - The other slot holds Line K+1 (the next one).

    // 1. Find the currently active line (latest one that has started)
    // Default to -1 if we are before the first line
    const currentActiveIndex = captions.reduce((prev, curr, idx) => {
        if (curr.startMs <= frameMs) return idx;
        return prev;
    }, -1);

    // If before start, treat as 0 (show first pair)
    const effectiveIndex = Math.max(0, currentActiveIndex);

    // 2. Determine which line goes in which slot
    // Slot 1 (Even/Top), Slot 2 (Odd/Bottom)
    let evenLineIndex = -1;
    let oddLineIndex = -1;

    if (effectiveIndex % 2 === 0) {
        // Current is Even (e.g., 0).
        // Show Current (0) and Next (1).
        evenLineIndex = effectiveIndex;
        oddLineIndex = effectiveIndex + 1;
    } else {
        // Current is Odd (e.g., 1).
        // Show Next (2) and Current (1).
        // Note: The "Next" line (2) replaces the old Even line (0).
        evenLineIndex = effectiveIndex + 1;
        oddLineIndex = effectiveIndex;
    }

    const renderSlot = (index: number, positionStyle: React.CSSProperties, align: 'left' | 'center' | 'right') => {
        if (index === -1) return null;
        const caption = captions[index];
        if (!caption) return null;

        return (
            <div style={{ ...positionStyle, width: '100%', textAlign: align, padding: '0 80px' }}>
                <div style={{ display: align === 'center' ? 'flex' : 'block', justifyContent: 'center' }}>
                    <div style={{ display: 'inline-block', textAlign: 'center' }}>
                        <KaraokeSubtitleLine
                            caption={caption}
                            frameMs={frameMs}
                            sungColor={sungColor}
                            unsungColor={unsungColor}
                            fontSize={fontSize}
                            opacity={1}
                            scale={1}
                            enableShadow={enableShadow}
                            fontFamily={activeFontFamily}
                        />
                    </div>
                </div>
            </div>
        );
    };

    const isTraditional = lyricsLayout === 'traditional';

    // Configuration for slots
    // Traditional: Slot 1 (Left/Higher), Slot 2 (Right/Lower)
    // Adjusted positions higher by 20px
    const slot1Style: React.CSSProperties = {
        position: 'absolute',
        bottom: isTraditional ? '200px' : '200px', // Top slot (Even lines)
        left: 0,
    };
    const slot2Style: React.CSSProperties = {
        position: 'absolute',
        bottom: '80px', // Bottom slot (Odd lines)
        left: 0,
    };

    // Alignments
    const align1 = isTraditional ? 'left' : 'center'; // Even lines (0, 2...)
    const align2 = isTraditional ? 'right' : 'center'; // Odd lines (1, 3...)

    // Tính toán video background timing
    const videoStartTime = backgroundVideoStartTime || 0;
    const videoDuration = backgroundVideoDuration || 0;
    const videoEndTimeInComposition = videoDuration > 0 ? videoDuration - videoStartTime : 0;
    const safeZone = 15;
    const calculatedEndFrame = videoEndTimeInComposition > 0 ? Math.floor(videoEndTimeInComposition * fps) : 0;
    const videoEndFrame = Math.max(0, calculatedEndFrame - safeZone);
    const audioEndFrame = durationInFrames;

    // Tính trimBefore (frames) để bắt đầu video từ điểm chỉ định
    const trimBeforeFrames = Math.floor(videoStartTime * fps);

    // Kiểm tra các trường hợp:
    const isVideoEnded = videoDuration > 0 && frame >= videoEndFrame;
    const isAudioEnded = frame >= audioEndFrame;
    const shouldShowDimOverlay = isAudioEnded && !isVideoEnded && backgroundType === 'video';

    // Frame để freeze: frame cuối của video trong composition
    const freezeFrame = isVideoEnded && videoEndFrame > 0 ? videoEndFrame - 1 : undefined;

    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            {/* Background layer */}
            {backgroundType === 'black' && null}
            {backgroundType === 'image' && backgroundSrc && (
                <AbsoluteFill>
                    <Img
                        src={backgroundSrc}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
                        }}
                    />
                </AbsoluteFill>
            )}
            {backgroundType === 'video' && backgroundSrc && videoDuration > 0 && (
                <AbsoluteFill>
                    {freezeFrame !== undefined ? (
                        <Freeze frame={freezeFrame}>
                            <Video
                                src={backgroundSrc}
                                volume={0}
                                startFrom={trimBeforeFrames > 0 ? trimBeforeFrames : undefined}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
                                }}
                            />
                        </Freeze>
                    ) : (
                        <Video
                            src={backgroundSrc}
                            volume={0}
                            startFrom={trimBeforeFrames > 0 ? trimBeforeFrames : undefined}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
                            }}
                        />
                    )}
                </AbsoluteFill>
            )}

            {/* Lớp làm mờ nền */}
            {(backgroundType === 'image' || backgroundType === 'video') && (
                <AbsoluteFill
                    style={{
                        backgroundColor: '#000',
                        opacity: shouldShowDimOverlay ? 0.8 : 1 - backgroundDim,
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Audio */}
            {audioSrc && <Audio src={audioSrc} />}

            {/* Lyrics Layer - Simplified for Traditional/Bottom only */}
            <AbsoluteFill>
                {/* Even Slot (Line 0, 2, 4...) */}
                {renderSlot(evenLineIndex, slot1Style, align1)}

                {/* Odd Slot (Line 1, 3, 5...) */}
                {renderSlot(oddLineIndex, slot2Style, align2)}
            </AbsoluteFill>
        </AbsoluteFill>
    );
};
