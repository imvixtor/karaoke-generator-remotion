'use client';

import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { CallbackListener, Player, PlayerRef } from '@remotion/player';
import { KaraokeComposition } from '../../remotion/KaraokeComposition';
import type { KaraokeCaption, BackgroundType, KaraokeCompositionProps } from '../../types/karaoke';
import { parseSrtContent, parseAssContent } from '../../lib/parseSrt';
import { useAudioDuration } from '../../hooks/useAudioDuration';
import { useVideoDuration } from '../../hooks/useVideoDuration';

const STORAGE_KEY = 'karaoke-editor-data';

// Helper: Chuyển ms sang mm:ss.ms (2 chữ số phần ms)
function msToTimeString(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10); // Lấy 2 chữ số đầu của ms
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

// Helper: Chuyển mm:ss.ms sang ms
function timeStringToMs(timeStr: string): number {
    // Định dạng mm:ss.ms hoặc mm:ss
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0], 10) || 0;

    // parseFloat(parts[1]) sẽ parse cả phần thập phân, ví dụ .12 -> 0.12s = 120ms
    const secondsFloat = parseFloat(parts[1]) || 0;
    return Math.round((minutes * 60 + secondsFloat) * 1000);
}

// Helper: Chuyển ms sang SRT format (HH:MM:SS,ms)
function formatSrtTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Hook lấy frame hiện tại của Player, được khuyến nghị trong docs Remotion
const useCurrentPlayerFrame = (ref: React.RefObject<PlayerRef | null>) => {
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            const { current } = ref;
            if (!current) {
                return () => undefined;
            }

            const updater: CallbackListener<'frameupdate'> = () => {
                onStoreChange();
            };

            current.addEventListener('frameupdate', updater);

            return () => {
                current.removeEventListener('frameupdate', updater);
            };
        },
        [ref],
    );

    const frame = useSyncExternalStore<number>(
        subscribe,
        () => ref.current?.getCurrentFrame() ?? 0,
        () => 0,
    );

    return frame;
};

const TimeDisplay: React.FC<{
    playerRef: React.RefObject<PlayerRef | null>;
    fps: number;
}> = ({ playerRef, fps }) => {
    const frame = useCurrentPlayerFrame(playerRef);
    const ms = (frame / fps) * 1000;

    return (
        <div className="font-mono text-cyan-400 font-bold bg-zinc-900 px-3 py-1 rounded border border-zinc-700 shadow-inner">
            {msToTimeString(ms)}
        </div>
    );
};

export default function EditorPage() {
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioFileName, setAudioFileName] = useState<string | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [captions, setCaptions] = useState<KaraokeCaption[]>([]);
    const [backgroundType, setBackgroundType] = useState<BackgroundType>('black');
    const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
    const [backgroundFileName, setBackgroundFileName] = useState<string | null>(null);
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [sungColor, setSungColor] = useState('#00ff88');
    const [unsungColor, setUnsungColor] = useState('#ffffff');
    const [fontSize, setFontSize] = useState<number | string>(65);
    const [enableShadow, setEnableShadow] = useState(false); // Default false
    const [backgroundDim, setBackgroundDim] = useState(0.30);

    const [backgroundVideoStartTime, setBackgroundVideoStartTime] = useState<number | string>(0);
    const [videoLoop, setVideoLoop] = useState(false); // New Loop option
    const [renderStatus, setRenderStatus] = useState<string | null>(null);
    const [crf, setCrf] = useState(25);
    const [renderSample, setRenderSample] = useState(false);
    const [lyricsLayout, setLyricsLayout] = useState<'traditional' | 'bottom'>('traditional');
    const [renderStartTime, setRenderStartTime] = useState<number | null>(null);
    const [renderDuration, setRenderDuration] = useState<string | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState<number>(0); // ms
    const [fontFamily, setFontFamily] = useState('Roboto');
    const playerRef = useRef<PlayerRef>(null);
    const saveTimeoutRef = useRef<number | null>(null);

    const currentAudioSrc = audioUrl ?? '';
    const audioDurationSec = useAudioDuration(currentAudioSrc || null);

    // Global hotkeys: Space (play/pause), F (fullscreen), M (mute)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            const tag = target.tagName;
            const isTyping =
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SELECT' ||
                target.isContentEditable;

            if (isTyping) {
                return;
            }

            const player = playerRef.current;
            if (!player) return;

            // Space: play / pause
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                player.toggle();
                return;
            }

            // F: fullscreen toggle
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                if (player.isFullscreen()) {
                    player.exitFullscreen();
                } else {
                    player.requestFullscreen();
                }
                return;
            }

            // M: mute toggle
            if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                if (player.isMuted()) {
                    player.unmute();
                    // Khôi phục volume về 1 nếu trước đó đang 0
                    if (player.getVolume() === 0) {
                        player.setVolume(1);
                    }
                } else {
                    player.mute();
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
    const durationInFrames = audioDurationSec != null ? Math.ceil(audioDurationSec * FPS) : 30 * FPS;
    const videoDurationSec = useVideoDuration(backgroundType === 'video' ? (backgroundUrl ?? null) : null);

    const handleAudioChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setAudioFile(null);
            setAudioFileName(null);
            setAudioUrl(null);
            return;
        }
        setAudioFile(file);
        setAudioFileName(file.name);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
            const json = await resp.json();
            if (json.url) {
                setAudioUrl(json.url as string);
            }
        } catch (err) {
            console.error('Upload audio failed', err);
            setRenderStatus('Upload audio thất bại.');
        }
    }, []);

    const handleSrtFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result);
            const lower = file.name.toLowerCase();
            if (lower.endsWith('.ass')) {
                setCaptions(parseAssContent(text));
            } else {
                setCaptions(parseSrtContent(text));
            }
        };
        reader.readAsText(file, 'utf-8');
    }, []);



    const handleBackgroundFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setBackgroundFile(null);
            setBackgroundFileName(null);
            setBackgroundUrl(null);
            return;
        }
        setBackgroundFile(file);
        setBackgroundFileName(file.name);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
            const json = await resp.json();
            if (json.url) {
                setBackgroundUrl(json.url as string);
            }
        } catch (err) {
            console.error('Upload background failed', err);
            setRenderStatus('Upload background thất bại.');
        }
    }, []);

    const handleExportSrt = useCallback(() => {
        if (captions.length === 0) {
            alert('Chưa có phụ đề để xuất.');
            return;
        }

        let content = '';
        captions.forEach((cap, index) => {
            content += `${index + 1}\n`;
            content += `${formatSrtTime(cap.startMs)} --> ${formatSrtTime(cap.endMs)}\n`;
            content += `${cap.text}\n\n`;
        });

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'subtitles.srt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [captions]);

    const handleClearCaptions = useCallback(() => {
        if (window.confirm('Bạn có chắc chắn muốn xóa hết phụ đề không?')) {
            setCaptions([]);
        }
    }, []);

    const updateCaption = useCallback((index: number, field: keyof KaraokeCaption, value: string | number) => {
        setCaptions((prev) =>
            prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
        );
    }, []);

    const addCaption = useCallback((afterIndex?: number) => {
        const audioDuration = audioDurationSec ?? 0;
        let newStart = 0;
        let newEnd = 3000;

        if (afterIndex !== undefined && captions[afterIndex]) {
            // Thêm sau dòng chỉ định
            newStart = captions[afterIndex].endMs;
            newEnd = Math.min(newStart + 3000, audioDuration * 1000);
        } else if (captions.length > 0) {
            // Thêm ở cuối
            const lastEnd = Math.max(...captions.map(c => c.endMs));
            newStart = lastEnd;
            newEnd = Math.min(newStart + 3000, audioDuration * 1000);
        }

        const newCaption: KaraokeCaption = {
            text: 'Phụ đề mới',
            startMs: newStart,
            endMs: newEnd,
            timestampMs: (newStart + newEnd) / 2,
            confidence: 1,
        };

        if (afterIndex !== undefined) {
            setCaptions((prev) => [
                ...prev.slice(0, afterIndex + 1),
                newCaption,
                ...prev.slice(afterIndex + 1),
            ]);
        } else {
            setCaptions((prev) => [...prev, newCaption]);
        }
    }, [captions, audioDurationSec]);

    const deleteCaption = useCallback((index: number) => {
        setCaptions((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // Drag & Drop để sắp xếp lại thứ tự
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const handleDragStart = useCallback((index: number) => {
        setDraggedIndex(index);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newCaptions = [...captions];
        const draggedItem = newCaptions[draggedIndex];
        newCaptions.splice(draggedIndex, 1);
        newCaptions.splice(index, 0, draggedItem);
        setCaptions(newCaptions);
        setDraggedIndex(index);
    }, [captions, draggedIndex]);

    const handleDragEnd = useCallback(() => {
        setDraggedIndex(null);
    }, []);

    // Lưu cấu hình editor vào sessionStorage với debounce để tránh JSON.stringify quá thường xuyên
    useEffect(() => {
        const data = {
            captions,
            backgroundType,
            backgroundDim,

            backgroundVideoStartTime,
            sungColor,
            unsungColor,
            fontSize,
            enableShadow,
            audioUrl,
            audioFileName,
            backgroundUrl,
            backgroundFileName,
            crf,
            renderSample,
            lyricsLayout,
            fontFamily,
            videoLoop,
        };

        // Debounce: chỉ ghi sau 300ms kể từ thay đổi cuối
        if (saveTimeoutRef.current !== null) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            try {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (err) {
                // Tránh crash nếu quota đầy hoặc sessionStorage không khả dụng
                console.warn('Không thể lưu cấu hình editor vào sessionStorage', err);
            }
        }, 300);

        return () => {
            if (saveTimeoutRef.current !== null) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [captions, backgroundType, backgroundDim, backgroundVideoStartTime, sungColor, unsungColor, fontSize, enableShadow, audioUrl, audioFileName, backgroundUrl, backgroundFileName, crf, renderSample, lyricsLayout, fontFamily, videoLoop]);

    // Load từ sessionStorage khi mount
    useEffect(() => {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);

                if (data.captions) setCaptions(data.captions);
                if (data.backgroundType) setBackgroundType(data.backgroundType);
                if (data.backgroundDim !== undefined) setBackgroundDim(data.backgroundDim);

                if (data.backgroundVideoStartTime !== undefined) setBackgroundVideoStartTime(data.backgroundVideoStartTime);
                if (data.sungColor) setSungColor(data.sungColor);
                if (data.unsungColor) setUnsungColor(data.unsungColor);
                if (data.fontSize) setFontSize(data.fontSize);
                if (data.enableShadow !== undefined) setEnableShadow(data.enableShadow);
                if (data.audioUrl) setAudioUrl(data.audioUrl);
                if (data.backgroundUrl) setBackgroundUrl(data.backgroundUrl);
                if (data.audioFileName) setAudioFileName(data.audioFileName);
                if (data.backgroundFileName) setBackgroundFileName(data.backgroundFileName);
                if (data.crf) setCrf(data.crf);
                if (data.renderSample !== undefined) setRenderSample(data.renderSample);
                if (data.lyricsLayout) setLyricsLayout(data.lyricsLayout);
                if (data.fontFamily) setFontFamily(data.fontFamily);
                if (data.videoLoop !== undefined) setVideoLoop(data.videoLoop);
            } catch (e) {
                console.error('Failed to load saved data:', e);
            }
        }
    }, []);

    const playerProps: KaraokeCompositionProps = {
        audioSrc: currentAudioSrc,
        captions,
        backgroundType,
        backgroundSrc: backgroundType !== 'black' ? (backgroundUrl ?? undefined) : undefined,
        backgroundDim,

        backgroundVideoStartTime: Number(backgroundVideoStartTime),
        backgroundVideoDuration: videoDurationSec ?? undefined,
        sungColor,
        unsungColor,
        fontSize: Number(fontSize),
        enableShadow,
        durationInFrames,
        fps: FPS,
        lyricsLayout,
        fontFamily,
        videoLoop,
    };

    const [renderProgress, setRenderProgress] = useState<number | null>(null);
    const [renderingId, setRenderingId] = useState<string | null>(null);

    const handleCancel = useCallback(async () => {
        if (!renderingId) return;
        try {
            await fetch(`/api/render?id=${renderingId}`, { method: 'DELETE' });
            setRenderStatus('Đã hủy render');
            setRenderProgress(null);
            setRenderingId(null);
            setRenderStartTime(null);
            setElapsedTime(0);
        } catch (e) {
            console.error(e);
            setRenderStatus('Lỗi khi hủy render');
        }
    }, [renderingId]);

    const handleRender = useCallback(async () => {
        if (!currentAudioSrc) {
            alert('Vui lòng chọn file âm thanh trước khi render.');
            return;
        }
        if (captions.length === 0) {
            alert('Vui lòng thêm phụ đề trước khi render.');
            return;
        }
        if (backgroundType === 'video' && !videoDurationSec) {
            alert('Đang tải thông tin video nền, vui lòng đợi...');
            return;
        }

        // Clone and convert to absolute URLs for renderer
        const inputProps = { ...playerProps };
        if (inputProps.audioSrc && inputProps.audioSrc.startsWith('/')) {
            inputProps.audioSrc = window.location.origin + inputProps.audioSrc;
        }
        if (inputProps.backgroundSrc && inputProps.backgroundSrc.startsWith('/')) {
            inputProps.backgroundSrc = window.location.origin + inputProps.backgroundSrc;
        }

        try {
            setRenderStatus('Đang render...');
            setRenderProgress(0);
            const startTime = Date.now();
            setRenderStartTime(startTime);
            setElapsedTime(0);
            setRenderDuration(null);
            setDownloadUrl(null);
            const resp = await fetch('/api/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputProps,
                    options: { crf, renderSample }
                }),
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const json = await resp.json();
            if (json.renderId) {
                setRenderingId(json.renderId);
                // Poll for progress
                const pollProgress = async () => {
                    try {
                        const progressResp = await fetch(`/api/render?id=${json.renderId}`);
                        if (progressResp.ok) {
                            const progressData = await progressResp.json();

                            if (progressData.status === 'cancelled') {
                                setRenderStatus('Đã hủy render');
                                setRenderProgress(null);
                                setRenderingId(null);
                                return;
                            }

                            setRenderProgress(progressData.progress);
                            if (progressData.status === 'done') {
                                setRenderStatus(`Render xong: ${progressData.filename}`);
                                setRenderProgress(null);
                                setRenderingId(null);

                                const elapsed = Date.now() - startTime;
                                setElapsedTime(elapsed);
                                setRenderDuration(msToTimeString(elapsed).split('.')[0]); // format mm:ss
                                setDownloadUrl(progressData.filename);
                                return;
                            } else if (progressData.status === 'error') {
                                setRenderStatus(`Render thất bại: ${progressData.error}`);
                                setRenderProgress(null);
                                setRenderingId(null);
                                return;
                            }
                        } else if (progressResp.status === 404) {
                            // Likely cancelled
                            setRenderStatus('Đã hủy render');
                            setRenderProgress(null);
                            setRenderingId(null);
                            setRenderStartTime(null);
                            return;
                        }
                        setTimeout(pollProgress, 1000);
                    } catch {
                        setTimeout(pollProgress, 1000);
                    }
                };
                pollProgress();
            } else if (json.success) {
                setRenderStatus(`Render xong: ${json.filename}`);
                setRenderProgress(null);
            } else {
                setRenderStatus(`Render thất bại: ${json.error}`);
                setRenderProgress(null);
            }
        } catch (e) {
            console.error(e);
            setRenderStatus('Render thất bại. Kiểm tra console.');
            setRenderProgress(null);
        }
    }, [playerProps, currentAudioSrc, captions.length, crf, renderSample]);

    // Timer effect
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (renderStartTime && renderProgress !== null) {
            // Update elapsed time every 100ms
            interval = setInterval(() => {
                setElapsedTime(Date.now() - renderStartTime);
            }, 100);
        } else if (!renderStartTime) {
            setElapsedTime(0);
        }
        return () => clearInterval(interval);
    }, [renderStartTime, renderProgress]);

    // Format helper for timer (mm:ss)
    const formatTimer = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-200 p-8 font-sans">
            <header className="mb-8 border-b border-zinc-800 pb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-green-500 mb-2">
                        Karaoke Generator
                    </h1>
                    <p className="text-zinc-400 text-sm">Chỉnh sửa phụ đề, nền và xuất video với Remotion</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end gap-1">
                        {renderProgress !== null && (
                            <div className="flex items-center gap-2">
                                <div className="w-32 h-2 bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-cyan-500 to-green-500 transition-all duration-300"
                                        style={{ width: `${renderProgress}%` }}
                                    />
                                </div>
                                <span className="text-xs font-mono text-cyan-400">{renderProgress}%</span>
                            </div>
                        )}
                        {renderStatus && renderProgress === null && (
                            <span className="text-sm font-mono text-cyan-400">{renderStatus}</span>
                        )}
                        {(renderStartTime || renderDuration) && (
                            <span className="text-xs font-mono text-zinc-500">
                                {renderProgress !== null ? formatTimer(elapsedTime) : `Thời gian: ${renderDuration}`}
                            </span>
                        )}
                    </div>
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download
                            target="_blank"
                            className="px-6 py-3 font-bold rounded-lg shadow-lg transition-all bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/30 flex items-center gap-2"
                        >
                            <span>Download Video</span>
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={renderProgress !== null ? handleCancel : handleRender}
                        disabled={renderProgress !== null && !renderingId}
                        className={`px-6 py-3 font-bold rounded-lg shadow-lg transition-all ${renderProgress !== null
                            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                            : 'bg-gradient-to-r from-green-500 to-green-400 hover:from-green-700 hover:to-green-500 text-black hover:shadow-xl'
                            }`}
                    >
                        {renderProgress !== null ? 'Hủy Render' : 'Render Video'}
                    </button>
                </div>
            </header>

            <div className="flex flex-wrap gap-8">
                <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">
                    <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-4 tracking-wider">Âm thanh</h2>
                        <input type="file" accept="audio/*" onChange={handleAudioChange} className="w-full text-sm bg-zinc-800 p-2 rounded mb-2 border border-zinc-700" />
                        {(audioFileName || audioFile) && (
                            <p className="text-xs text-zinc-500 truncate">
                                {audioFileName ?? audioFile?.name}
                            </p>
                        )}
                    </section>



                    <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-4 tracking-wider">Nền</h2>
                        <select
                            value={backgroundType}
                            onChange={(e) => setBackgroundType(e.target.value as BackgroundType)}
                            className="w-full bg-zinc-800 p-2 rounded border border-zinc-700 text-sm mb-4"
                        >
                            <option value="black">Đen (mặc định)</option>
                            <option value="image">Hình ảnh</option>
                            <option value="video">Video</option>
                        </select>
                        {(backgroundType === 'image' || backgroundType === 'video') && (
                            <div className="space-y-4">
                                <input
                                    type="file"
                                    accept={backgroundType === 'image' ? 'image/*' : 'video/*'}
                                    onChange={handleBackgroundFile}
                                    className="w-full text-sm bg-zinc-800 p-2 rounded border border-zinc-700"
                                />
                                {(backgroundFileName || backgroundFile) && (
                                    <p className="text-xs text-zinc-500 truncate">
                                        {backgroundFileName ?? backgroundFile?.name}
                                    </p>
                                )}

                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span>Độ mờ nền</span>
                                        <span>{Math.round(backgroundDim * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={backgroundDim}
                                        onChange={(e) => setBackgroundDim(Number(e.target.value))}
                                        className="w-full accent-green-500"
                                    />
                                </div>



                                {backgroundType === 'video' && (
                                    <>
                                        <div>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span>Bắt đầu video từ</span>
                                                <span>{Number(backgroundVideoStartTime).toFixed(1)}s</span>
                                            </div>
                                            <input
                                                type="number"
                                                min={0}
                                                max={videoDurationSec ? Math.max(0, videoDurationSec - 1) : 0}
                                                step={0.1}
                                                value={backgroundVideoStartTime}
                                                onChange={(e) => setBackgroundVideoStartTime(e.target.value)}
                                                onBlur={() => {
                                                    let val = Number(backgroundVideoStartTime);
                                                    if (isNaN(val) || val < 0) val = 0;
                                                    const max = videoDurationSec ? Math.max(0, videoDurationSec - 1) : 0;
                                                    if (val > max) val = max;
                                                    setBackgroundVideoStartTime(val);
                                                }}
                                                className="w-full bg-zinc-800 p-2 rounded border border-zinc-700 text-sm"
                                                disabled={!videoDurationSec}
                                            />
                                        </div>
                                        {videoDurationSec && (
                                            <p className="text-xs text-zinc-500 mt-1">
                                                Video: {videoDurationSec.toFixed(1)}s |
                                                Audio: {audioDurationSec?.toFixed(1) ?? '?'}s
                                            </p>
                                        )}
                                        <div className="mt-2">
                                            <label className="flex items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={videoLoop}
                                                    onChange={(e) => setVideoLoop(e.target.checked)}
                                                    className="rounded bg-zinc-800 border-zinc-700 accent-green-500"
                                                />
                                                Lặp lại video (Loop)
                                            </label>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-4 tracking-wider">Phụ đề</h2>
                        <div className="flex items-center gap-4 mb-2">
                            <label className="text-xs flex items-center gap-2">
                                Màu đã hát
                                <input
                                    type="color"
                                    value={sungColor}
                                    onChange={(e) => setSungColor(e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                                />
                            </label>
                            <label className="text-xs flex items-center gap-2">
                                Màu chưa hát
                                <input
                                    type="color"
                                    value={unsungColor}
                                    onChange={(e) => setUnsungColor(e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                                />
                            </label>
                        </div>
                        <label className="text-xs flex flex-col gap-1">
                            Cỡ chữ (px)
                            <input
                                type="number"
                                min={24}
                                max={120}
                                value={fontSize}
                                onChange={(e) => setFontSize(e.target.value)}
                                onBlur={() => {
                                    let val = Number(fontSize);
                                    if (isNaN(val) || val < 24) val = 24;
                                    if (val > 120) val = 120;
                                    setFontSize(val);
                                }}
                                className="w-full bg-zinc-800 p-2 rounded border border-zinc-700 text-sm"
                            />
                        </label>

                        <label className="text-xs flex flex-col gap-1 mt-2">
                            Font chữ
                            <select
                                value={fontFamily}
                                onChange={(e) => setFontFamily(e.target.value)}
                                className="w-full bg-zinc-800 p-2 rounded border border-zinc-700 text-sm"
                            >
                                <option value="Roboto">Roboto (Mặc định)</option>
                                <option value="Inter Tight">Inter Tight</option>
                                <option value="Arial">Arial</option>
                                <option value="Times New Roman">Times New Roman</option>
                                <option value="Lora">Lora (Serif)</option>
                                <option value="Montserrat">Montserrat</option>
                                <option value="Oswald">Oswald</option>
                                <option value="Playfair Display">Playfair Display (Serif)</option>
                            </select>
                        </label>

                        <div className="mt-4">
                            <label className="flex items-center gap-2 text-xs mb-2">
                                <input
                                    type="checkbox"
                                    checked={enableShadow}
                                    onChange={(e) => setEnableShadow(e.target.checked)}
                                    className="rounded bg-zinc-800 border-zinc-700 accent-green-500"
                                />
                                Bật đổ bóng (Drop Shadow)
                            </label>
                        </div>

                        <div className="mt-4 border-t border-zinc-800 pt-4">
                            <h3 className="text-xs font-bold text-zinc-500 mb-2 uppercase">Bố cục lời</h3>
                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="radio"
                                        name="lyricsLayout"
                                        value="traditional"
                                        checked={lyricsLayout === 'traditional'}
                                        onChange={() => setLyricsLayout('traditional')}
                                        className="accent-green-500"
                                    />
                                    Truyền thống (Trái/Phải - Dưới)
                                </label>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="radio"
                                        name="lyricsLayout"
                                        value="bottom"
                                        checked={lyricsLayout === 'bottom'}
                                        onChange={() => setLyricsLayout('bottom')}
                                        className="accent-green-500"
                                    />
                                    Căn dưới (Giữa)
                                </label>
                            </div>
                        </div>
                    </section>

                    <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-4 tracking-wider">Render Setting</h2>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span>CRF - Thấp hơn là nét hơn</span>
                                <span>{crf}</span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={40}
                                step={1}
                                value={crf}
                                onChange={(e) => setCrf(Number(e.target.value))}
                                className="w-full accent-green-500"
                            />
                            <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                                <span>10 (Nét)</span>
                                <span>40 (Nhẹ)</span>
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={renderSample}
                                    onChange={(e) => setRenderSample(e.target.checked)}
                                    className="rounded bg-zinc-800 border-zinc-700 accent-green-500"
                                />
                                Render mẫu (30s đầu)
                            </label>
                        </div>
                    </section>
                </aside>

                <div className="flex-1 min-w-0">
                    <div className="mb-6">
                        {/* <h2 className="text-lg font-bold text-zinc-400 mb-4">Xem trước</h2> */}
                        {currentAudioSrc ? (
                            <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black aspect-video shadow-2xl">
                                <Player
                                    acknowledgeRemotionLicense
                                    ref={playerRef}
                                    component={KaraokeComposition}
                                    inputProps={playerProps}
                                    durationInFrames={durationInFrames}
                                    fps={FPS}
                                    compositionWidth={WIDTH}
                                    compositionHeight={HEIGHT}
                                    style={{ width: '100%', height: '100%' }}
                                    controls
                                    loop
                                />
                            </div>
                        ) : (
                            <div className="aspect-video flex items-center justify-center bg-zinc-900 rounded-xl border border-dashed border-zinc-700 text-zinc-500">
                                Chọn file âm thanh để xem trước
                            </div>
                        )}
                    </div>

                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
                            <span className="font-bold text-sm">Chỉnh sửa phụ đề ({captions.length} dòng)</span>

                            {/* Clock Display */}
                            {currentAudioSrc ? (
                                <TimeDisplay playerRef={playerRef} fps={FPS} />
                            ) : (
                                <div className="font-mono text-cyan-400 font-bold bg-zinc-900 px-3 py-1 rounded border border-zinc-700 shadow-inner">
                                    00:00.00
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button type="button" onClick={handleClearCaptions} className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-500 rounded text-xs">
                                    Delete all
                                </button>
                                <button type="button" onClick={handleExportSrt} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                                    Export SRT
                                </button>
                                <label className="cursor-pointer px-3 py-1 bg-green-500 hover:bg-green-600 text-black font-bold rounded text-xs flex items-center gap-1">
                                    <span>Import SRT</span>
                                    <input type="file" accept=".srt,.ass,text/plain" onChange={handleSrtFile} className="hidden" />
                                </label>
                            </div>
                        </div>

                        <div className="max-h-[500px] overflow-y-auto p-2 space-y-2 scroller">
                            {captions.length === 0 ? (
                                <p className="text-center text-zinc-500 py-8 text-sm">Chưa có phụ đề. Thêm dòng mới hoặc Import file.</p>
                            ) : (
                                captions.map((c, i) => (
                                    <div
                                        key={i}
                                        draggable
                                        onDragStart={() => handleDragStart(i)}
                                        onDragOver={(e) => handleDragOver(e, i)}
                                        onDragEnd={handleDragEnd}
                                        className={`flex gap-2 items-center bg-zinc-800 p-2 rounded border border-zinc-700 ${draggedIndex === i ? 'opacity-50' : ''}`}
                                    >
                                        <span className="cursor-move text-zinc-500 px-2 select-none">☰</span>
                                        <div className="flex flex-col gap-1">
                                            <input
                                                type="text"
                                                value={msToTimeString(c.startMs)}
                                                onChange={(e) => {
                                                    const ms = timeStringToMs(e.target.value);
                                                    if (!isNaN(ms)) updateCaption(i, 'startMs', ms);
                                                }}
                                                className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-center font-mono"
                                                placeholder="00:00.00"
                                            />
                                            <input
                                                type="text"
                                                value={msToTimeString(c.endMs)}
                                                onChange={(e) => {
                                                    const ms = timeStringToMs(e.target.value);
                                                    if (!isNaN(ms)) updateCaption(i, 'endMs', ms);
                                                }}
                                                className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-center font-mono"
                                                placeholder="00:00.00"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={c.text}
                                            onChange={(e) => updateCaption(i, 'text', e.target.value)}
                                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                                        />
                                        <div className="flex flex-col gap-1">
                                            <button
                                                type="button"
                                                onClick={() => addCaption(i)}
                                                className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
                                                title="Thêm dòng"
                                            >
                                                +
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteCaption(i)}
                                                className="w-6 h-6 flex items-center justify-center bg-red-900/50 hover:bg-red-900 text-red-500 rounded text-xs"
                                                title="Xóa dòng"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                            <button
                                type="button"
                                onClick={() => addCaption()}
                                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm text-zinc-400 flex items-center justify-center gap-2 mt-2"
                            >
                                <span>+ Thêm dòng phụ đề</span>
                            </button>
                        </div>
                    </div>

                    {/* Render section moved to header */}
                </div >
            </div >
        </div >
    );
}
