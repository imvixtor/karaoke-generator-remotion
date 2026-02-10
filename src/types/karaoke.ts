export type KaraokeCaption = {
    text: string;
    startMs: number;
    endMs: number;
    timestampMs: number | null;
    confidence: number | null;
    /** Các segment karaoke (từng từ / âm tiết), dùng cho ASS \k */
    segments?: {
        text: string;
        startMs: number;
        endMs: number;
    }[];
};

export type BackgroundType = 'black' | 'image' | 'video';

export type KaraokeCompositionProps = {
    audioSrc: string;
    captions: KaraokeCaption[];
    backgroundType: BackgroundType;
    backgroundSrc?: string;
    /** Độ mờ nền (0 = tối hẳn, 1 = không mờ). Chỉ áp dụng khi nền là image/video. */
    backgroundDim?: number;
    /** Độ blur nền (0 = không blur, 100 = blur tối đa). Chỉ áp dụng khi nền là image/video. */
    backgroundBlur?: number;
    /** Thời điểm bắt đầu phát video nền (giây). Chỉ áp dụng khi nền là video. */
    backgroundVideoStartTime?: number;
    /** Độ dài video nền (giây). Chỉ áp dụng khi nền là video. Nếu không có, sẽ tự động detect. */
    backgroundVideoDuration?: number;
    /** Màu chữ đã hát (karaoke highlight) */
    sungColor?: string;
    /** Màu chữ chưa hát */
    unsungColor?: string;
    /** Cỡ chữ phụ đề (px) */
    fontSize?: number;
    /** Bật/tắt đổ bóng chữ */
    enableShadow?: boolean;
    /** Bật/tắt animation scroll */
    enableScrollAnimation?: boolean;
    /** Độ dài video (frames) */
    durationInFrames?: number;
    fps: number;
};
