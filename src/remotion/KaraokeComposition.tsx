import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, Img, OffthreadVideo, interpolate, Easing, Freeze } from 'remotion';
import type { KaraokeCompositionProps, KaraokeCaption } from '../types/karaoke';

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
}: {
    caption: KaraokeCaption;
    frameMs: number;
    sungColor: string;
    unsungColor: string;
    fontSize: number;
    opacity: number;
    scale: number;
    enableShadow: boolean;
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
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: fontSize * scale,
                lineHeight: 1.4,
                textShadow: enableShadow ? '0 3px 16px rgba(0,0,0,0.85)' : undefined,
                opacity,
                transform: `scale(1)`,
                willChange: 'opacity, transform, filter',
                // Blur mờ dần cho các câu phụ sẽ được áp dụng từ bên ngoài qua style.filter
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
}) => {
    const frame = useCurrentFrame();
    const frameMs = (frame / fps) * 1000;
    const { height, durationInFrames } = useVideoConfig();

    // Tìm index của câu hiện tại
    const currentIndex = useMemo(() => {
        return captions.findIndex((c) => frameMs >= c.startMs && frameMs <= c.endMs);
    }, [captions, frameMs]);

    // Scroll offset mượt (đơn vị: số dòng):
    // - Khi ở khoảng trống giữa 2 câu: giữ nguyên vị trí câu vừa xong (không nhảy đầu/cuối).
    // - Khi vào câu mới: animate scroll trong một khoảng thời gian cố định (số frame) để mượt.
    const scrollOffsetInLines = useMemo(() => {
        if (captions.length === 0) return 0;

        const firstStart = captions[0]?.startMs ?? 0;
        const lastEnd = captions[captions.length - 1]?.endMs ?? 0;

        if (currentIndex === -1) {
            if (frameMs < firstStart) return 0;
            if (frameMs > lastEnd) return captions.length - 1;
            // Đang ở khoảng trống giữa hai câu: giữ ở câu vừa kết thúc (câu có endMs <= frameMs gần nhất)
            let lastEndedIndex = 0;
            for (let i = 0; i < captions.length; i++) {
                if (captions[i].endMs <= frameMs) lastEndedIndex = i;
            }
            return lastEndedIndex;
        }

        if (currentIndex === 0) return 0;

        const caption = captions[currentIndex];
        const startMs = caption.startMs;
        const frameAtCaptionStart = (startMs / 1000) * fps;
        const framesSinceStart = frame - frameAtCaptionStart;

        // Animation scroll cố định: ~0.5s (15 frame @ 30fps), dùng easing để mượt
        const scrollDurationFrames = Math.max(12, Math.round(0.5 * fps));
        const scrollProgress = interpolate(
            framesSinceStart,
            [0, scrollDurationFrames],
            [0, 1],
            {
                extrapolateRight: 'clamp',
                extrapolateLeft: 'clamp',
                easing: Easing.out(Easing.cubic),
            }
        );

        return currentIndex - 1 + scrollProgress;
    }, [captions, currentIndex, frameMs, frame, fps]);

    // Hiển thị chỉ 5 câu gần câu hiện tại nhất (2 câu trước, câu hiện tại, 2 câu sau)
    const visibleCaptions = useMemo(() => {
        const centerIndex = Math.round(scrollOffsetInLines);
        const startIndex = Math.max(0, centerIndex - 2);
        const endIndex = Math.min(captions.length, centerIndex + 3);

        return captions.slice(startIndex, endIndex).map((c, i) => ({
            caption: c,
            offset: (startIndex + i) - scrollOffsetInLines,
        }));
    }, [captions, scrollOffsetInLines]);

    // Khoảng cách giữa các câu (tính bằng pixel)
    const lineSpacing = fontSize * 2.2;

    // Tính toán video background timing
    const videoStartTime = backgroundVideoStartTime || 0;
    const videoDuration = backgroundVideoDuration || 0;
    const videoEndTimeInComposition = videoDuration > 0 ? videoDuration - videoStartTime : 0;
    const videoEndFrame = videoEndTimeInComposition > 0 ? Math.floor(videoEndTimeInComposition * fps) : Infinity;
    const audioEndFrame = durationInFrames;

    // Tính trimBefore (frames) để bắt đầu video từ điểm chỉ định
    const trimBeforeFrames = Math.floor(videoStartTime * fps);

    // Kiểm tra các trường hợp:
    // - Video kết thúc trước audio: freeze frame cuối của video
    // - Audio kết thúc trước video: hiển thị overlay mờ sau khi hết audio
    const isVideoEnded = videoDuration > 0 && frame >= videoEndFrame;
    const isAudioEnded = frame >= audioEndFrame;
    const shouldShowDimOverlay = isAudioEnded && !isVideoEnded && backgroundType === 'video';

    // Frame để freeze: frame cuối của video trong composition (tương đương với frame cuối của video gốc)
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
            {backgroundType === 'video' && backgroundSrc && (
                <AbsoluteFill>
                    {freezeFrame !== undefined ? (
                        <Freeze frame={freezeFrame}>
                            <OffthreadVideo
                                src={backgroundSrc}
                                volume={0}
                                trimBefore={trimBeforeFrames > 0 ? trimBeforeFrames : undefined}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
                                }}
                            />
                        </Freeze>
                    ) : (
                        <OffthreadVideo
                            src={backgroundSrc}
                            volume={0}
                            trimBefore={trimBeforeFrames > 0 ? trimBeforeFrames : undefined}
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

            {/* Lớp làm mờ nền (chỉ khi dùng image/video, 0 = tối, 1 = không mờ) */}
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

            {/* Scrollable Karaoke lyrics container */}
            <AbsoluteFill
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                }}
            >
                {visibleCaptions.map(({ caption, offset }, idx) => {
                    // Tính opacity và scale dựa trên offset từ câu hiện tại
                    // offset = 0: câu hiện tại (opacity 1, scale 1)
                    // offset = ±1: câu gần (opacity 0.7, scale 0.9)
                    // offset = ±2: câu xa hơn (opacity 0.4, scale 0.75)
                    // offset > ±2: câu rất xa (opacity 0.15, scale 0.6)
                    const absOffset = Math.abs(offset);
                    const opacity = interpolate(
                        absOffset,
                        [0, 1, 2, 3],
                        [1, 0.7, 0.4, 0.15],
                        { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
                    );
                    const scale = 1;
                    const blurPx = interpolate(
                        absOffset,
                        [0, 1, 2, 3],
                        [0, 0, 3, 5],
                        { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
                    );

                    // Chỉ render những câu có opacity > 0.1 để tối ưu hiệu suất
                    if (opacity < 0.1) return null;

                    // Vị trí Y: câu hiện tại ở giữa (50%), các câu khác offset theo lineSpacing
                    const yPosition = height / 2 + offset * lineSpacing;

                    return (
                        <div
                            key={`${caption.startMs}-${idx}`}
                            style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                top: yPosition,
                                transform: 'translateY(-50%)',
                                width: '100%',
                                filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
                            }}
                        >
                            <KaraokeSubtitleLine
                                caption={caption}
                                frameMs={frameMs}
                                sungColor={sungColor}
                                unsungColor={unsungColor}
                                fontSize={fontSize}
                                opacity={opacity}
                                scale={scale}
                                enableShadow={enableShadow}
                            />
                        </div>
                    );
                })}
            </AbsoluteFill>
        </AbsoluteFill>
    );
};
