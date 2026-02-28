import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, Img, Video, Freeze, Loop } from 'remotion';
import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadLora } from '@remotion/google-fonts/Lora';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadPlayfairDisplay } from '@remotion/google-fonts/PlayfairDisplay';
import type { KaraokeCompositionProps, KaraokeCaption } from '../types/karaoke';

/**
 * Tránh load toàn bộ variants của tất cả font ngay từ đầu (rất nhiều request),
 * chỉ load đúng font đang được chọn + giới hạn weights/subsets.
 */
const resolveFontFamily = (selected: string) => {
    // Common subset set. "latin-ext" thường cần để hiển thị tiếng Việt tốt hơn.
    // Nhiều font trên Google Fonts tách riêng subset 'vietnamese' - nếu không load subset này có thể bị lỗi dấu.
    const subsets: Array<'latin' | 'latin-ext' | 'vietnamese'> = ['latin', 'latin-ext', 'vietnamese'];
    const weights: Array<'700'> = ['700']; // lyrics đang dùng fontWeight: 'bold'

    switch (selected) {
        case 'Inter Tight':
            return loadInterTight('normal', { weights, subsets }).fontFamily;
        case 'Roboto':
            return loadRoboto('normal', { weights, subsets }).fontFamily;
        case 'Lora':
            return loadLora('normal', { weights, subsets }).fontFamily;
        case 'Montserrat':
            return loadMontserrat('normal', { weights, subsets }).fontFamily;
        case 'Oswald':
            return loadOswald('normal', { weights, subsets }).fontFamily;
        case 'Playfair Display':
            return loadPlayfairDisplay('normal', { weights, subsets }).fontFamily;
        case 'Arial':
            return 'Arial, sans-serif';
        case 'Times New Roman':
            return '"Times New Roman", Times, serif';
        default:
            return loadRoboto('normal', { weights, subsets }).fontFamily;
    }
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
    fontFamily,
}: {
    caption: KaraokeCaption;
    frameMs: number;
    sungColor: string;
    unsungColor: string;
    fontSize: number;
    opacity: number;
    scale: number;
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
                fontFamily: fontFamily,
                fontWeight: 'bold',
                fontSize: fontSize * scale,
                lineHeight: 1.4,
                opacity,
                transform: `scale(1)`,
                willChange: 'opacity, transform',
                paintOrder: 'stroke fill',
                position: 'relative',
            }}
        >
            {/* Unsung layer (base) */}
            <span style={{ color: unsungColor, WebkitTextStroke: '12px #000000' }}>
                {text}
            </span>
            {/* Sung layer (overlay, smooth clip across entire line) */}
            {progress > 0 && (
                <span
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '20px 80px',
                        color: sungColor,
                        WebkitTextStroke: '12px #ffffff',
                        clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
                        pointerEvents: 'none',
                    }}
                >
                    {text}
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
    backgroundDim = 0.50,

    backgroundVideoStartTime = 0,
    backgroundVideoDuration,
    sungColor = '#00ff88',
    unsungColor = '#ffffff',
    fontSize = 80,
    fps,
    lyricsLayout = 'traditional',
    fontFamily = 'Oswald', // Default font
    videoLoop = false,
    renderForegroundOnly = false,
}) => {
    const frame = useCurrentFrame();
    const frameMs = (frame / fps) * 1000;
    const { durationInFrames } = useVideoConfig();

    // Thời gian "báo trước" để hiện câu trước khi chữ bắt đầu chạy (ms)
    const LEAD_IN_MS = 1000;

    // Ngưỡng khoảng cách giữa 2 câu để áp dụng fade-in/fade-out (ms)
    const GAP_THRESHOLD_MS = 5000;
    // Thời gian fade-in / fade-out (ms)

    // Map font name -> actual loaded CSS font-family (memoized; do NOT run every frame)
    const activeFontFamily = useMemo(() => resolveFontFamily(fontFamily), [fontFamily]);

    // Pre-compute chain metadata for each caption.
    // A "chain" is a maximal group of consecutive captions where each gap < GAP_THRESHOLD_MS.
    // isChainStart: first caption of a chain (gets fade-in)
    // isChainEnd: last caption of a chain (gets fade-out)
    // chainStartMs: startMs of the first caption in the chain (dùng để ẩn cả chuỗi cho đến khi chuỗi bắt đầu)
    const chainMeta = useMemo(() => {
        // Pass 1: xác định isChainStart / isChainEnd
        const meta = captions.map((cap, i) => {
            const prev = captions[i - 1];
            const next = captions[i + 1];
            const gapBefore = prev ? cap.startMs - prev.endMs : Infinity;
            const gapAfter = next ? next.startMs - cap.endMs : Infinity;
            const isChainStart = i === 0 || gapBefore >= GAP_THRESHOLD_MS;
            const isChainEnd = i === captions.length - 1 || gapAfter >= GAP_THRESHOLD_MS;
            return { isChainStart, isChainEnd, chainStartMs: cap.startMs };
        });
        // Pass 2: lan truyền chainStartMs cho các câu không phải đầu chuỗi
        let currentChainStartMs = 0;
        for (let i = 0; i < meta.length; i++) {
            if (meta[i].isChainStart) {
                currentChainStartMs = captions[i].startMs;
            }
            meta[i].chainStartMs = currentChainStartMs;
        }
        return meta;
    }, [captions]);

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
        const meta = chainMeta[index];

        // Ẩn toàn bộ chuỗi cho đến LEAD_IN_MS trước khi câu đầu tiên của chuỗi bắt đầu.
        // - Câu đầu chuỗi: ẩn đến chainStartMs - LEAD_IN_MS
        // - Câu trong chuỗi: cũng ẩn đến chainStartMs - LEAD_IN_MS → hiện bình thường khi chuỗi đã bắt đầu
        const chainVisibleFrom = (meta?.chainStartMs ?? caption.startMs) - LEAD_IN_MS;
        if (frameMs < chainVisibleFrom) {
            return null;
        }

        // Opacity luôn = 1, không fade.
        const opacity = 1;

        // Ẩn câu cuối chuỗi sau khi hát xong.
        if (meta?.isChainEnd) {
            if (frameMs >= caption.endMs) {
                return null;
            }
        }

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
                            opacity={opacity}
                            scale={1}
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

    // Dynamic height calculation
    // Line height factor: 1.25 (reduced from 1.4)
    // Vertical padding: 10px (reduced from 40px)
    // Gap: 0px (reduced from 10px)
    const singleLineHeight = fontSize * 1.25 + 10;
    const gap = 15;
    const bottomBase = 80;

    const slot1Bottom = bottomBase + singleLineHeight + gap;
    const slot2Bottom = bottomBase;

    const slot1Style: React.CSSProperties = {
        position: 'absolute',
        bottom: `${slot1Bottom}px`, // Top slot (Even lines)
        left: 0,
    };
    const slot2Style: React.CSSProperties = {
        position: 'absolute',
        bottom: `${slot2Bottom}px`, // Bottom slot (Odd lines)
        left: 0,
    };

    // Alignments
    const align1 = isTraditional ? 'left' : 'center'; // Even lines (0, 2...)
    const align2 = isTraditional ? 'right' : 'center'; // Odd lines (1, 3...)

    // Tính toán video background timing
    const videoStartTime = backgroundVideoStartTime || 0;
    const videoDuration = backgroundVideoDuration || 0;
    const videoTotalFrames = videoDuration > 0 ? Math.floor(videoDuration * fps) : 0;
    const trimBeforeFrames = Math.floor(videoStartTime * fps);

    // Effective duration of one video loop loop
    const effectiveVideoDurationFrames = Math.max(0, videoTotalFrames - trimBeforeFrames);

    const isVideoEnded = videoDuration > 0 && frame >= (effectiveVideoDurationFrames); // Relative to composition start if not looping

    // Logic for returning the Video component
    const renderVideo = () => (
        <Video
            src={backgroundSrc}
            volume={0}
            startFrom={trimBeforeFrames > 0 ? trimBeforeFrames : undefined}
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
            }}
        />
    );

    const audioEndFrame = durationInFrames;
    const isAudioEnded = frame >= audioEndFrame;

    const shouldShowDimOverlay = isAudioEnded && !isVideoEnded && backgroundType === 'video';

    // Nếu renderForegroundOnly = true, trả về nền trong suốt (null) cho phần background
    const showBackground = !renderForegroundOnly;

    return (
        <AbsoluteFill style={{ backgroundColor: showBackground ? '#000' : 'transparent' }}>
            {/* Background layer - chỉ render nếu không phải mode foreground-only */}
            {showBackground && backgroundType === 'black' && null}
            {showBackground && backgroundType === 'image' && backgroundSrc && (
                <AbsoluteFill>
                    <Img
                        src={backgroundSrc}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                </AbsoluteFill>
            )}
            {showBackground && backgroundType === 'video' && backgroundSrc && videoDuration > 0 && (
                <AbsoluteFill>
                    {videoLoop && effectiveVideoDurationFrames > 0 ? (
                        <Loop durationInFrames={effectiveVideoDurationFrames}>
                            {renderVideo()}
                        </Loop>
                    ) : (
                        <>
                            {/* If not looping, we freeze the last frame when it ends */}
                            {frame >= effectiveVideoDurationFrames ? (
                                <Freeze frame={effectiveVideoDurationFrames - 1}>
                                    {renderVideo()}
                                </Freeze>
                            ) : (
                                renderVideo()
                            )}
                        </>
                    )}
                </AbsoluteFill>
            )}

            {/* Lớp làm mờ nền */}
            {showBackground && (backgroundType === 'image' || backgroundType === 'video') && (
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
