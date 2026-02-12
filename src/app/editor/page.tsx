'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { KaraokeComposition } from '../../remotion/KaraokeComposition';
import type { KaraokeCaption, BackgroundType, KaraokeCompositionProps } from '../../types/karaoke';
import Timeline from '../../components/Timeline/Timeline';
import { SubtitleSidebar } from '../../components/Sidebar/SubtitleSidebar';
import { parseSrtContent, parseAssContent } from '../../lib/parseSrt';
import { useAudioDuration } from '../../hooks/useAudioDuration';
import { useVideoDuration } from '../../hooks/useVideoDuration';
import { Moon, Sun, Monitor, Download, X, Film, Music, Type, Settings, Layers, Image as ImageIcon, FileText } from 'lucide-react';
import { useTheme } from "next-themes";

const STORAGE_KEY = 'karaoke-editor-data';

// Helper: Chuyển ms sang mm:ss.ms (2 chữ số phần ms)
function msToTimeString(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10); // Lấy 2 chữ số đầu của ms
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
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
// Hook removed as it is now defined inside Timeline or unused in this file

// TimeDisplay component removed as it is unused and causes lint errors
// If needed later, re-implement as a separate component subscription.

export default function EditorPage() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
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
    const [enableShadow, setEnableShadow] = useState(true); // Default true
    const [backgroundDim, setBackgroundDim] = useState(0.50);
    const [zoom, setZoom] = useState(50); // pixels per second

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
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [timelineWarning, setTimelineWarning] = useState<string | null>(null);

    // Clear warning after 3s
    useEffect(() => {
        if (timelineWarning) {
            const timer = setTimeout(() => setTimelineWarning(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [timelineWarning]);

    const handleClearCaptions = useCallback(() => {
        if (selectedIndexes.length > 0) {
            // Delete selected
            setCaptions(prev => prev.filter((_, i) => !selectedIndexes.includes(i)));
            setSelectedIndexes([]);
        } else {
            // Delete all
            if (window.confirm('Bạn có chắc chắn muốn xóa hết phụ đề không?')) {
                setCaptions([]);
            }
        }
    }, [selectedIndexes]);

    const handleUpdateCaptionText = useCallback((index: number, newText: string) => {
        setCaptions(prev => prev.map((cap, i) =>
            i === index ? { ...cap, text: newText } : cap
        ));
    }, []);

    // Zoom constraints
    const minZoom = 10;
    const maxZoom = 200;

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 10, maxZoom));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 10, minZoom));
    const handleSetZoom = (val: number) => setZoom(Math.max(minZoom, Math.min(maxZoom, val)));

    // ... (rest of code)

    const handleDeleteKey = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Only if not typing in inputs
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;

            if (selectedIndexes.length > 0) {
                setCaptions(prev => prev.filter((_, i) => !selectedIndexes.includes(i)));
                setSelectedIndexes([]);
                e.preventDefault();
            }
        }
    }, [selectedIndexes]);

    useEffect(() => {
        window.addEventListener('keydown', handleDeleteKey);
        return () => window.removeEventListener('keydown', handleDeleteKey);
    }, [handleDeleteKey]);


    // ... inside return

    const [player, setPlayer] = useState<PlayerRef | null>(null);
    const playerRef = useRef<PlayerRef>(null);

    const setPlayerCallback = useCallback((p: PlayerRef | null) => {
        setPlayer(p);
        playerRef.current = p;
    }, []);

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





    const addCaption = useCallback(() => {
        const audioDuration = audioDurationSec ?? 30;
        let currentTime = 0;

        if (playerRef.current) {
            currentTime = playerRef.current.getCurrentFrame() / FPS;
        }

        // Convert to ms
        const currentMs = currentTime * 1000;
        const maxDurationMs = 3000;
        const minDurationMs = 500; // Minimum 0.5s to be usable

        // Find available space
        // Sort captions by start time
        const sortedCaps = [...captions].sort((a, b) => a.startMs - b.startMs);

        // Check if current time overlaps
        const overlap = sortedCaps.find(c => currentMs >= c.startMs && currentMs < c.endMs);
        if (overlap) {
            setTimelineWarning("Không thể thêm: Đang trùng với phụ đề khác!");
            return;
        }

        // Find next caption
        const nextCap = sortedCaps.find(c => c.startMs > currentMs);
        const nextStartMs = nextCap ? nextCap.startMs : (audioDuration * 1000);

        const availableGapName = nextStartMs - currentMs;

        if (availableGapName < minDurationMs) {
            setTimelineWarning("Không đủ chỗ trống để thêm phụ đề (cần ít nhất 0.5s)!");
            return;
        }

        const newDuration = Math.min(maxDurationMs, availableGapName);

        const newCaption: KaraokeCaption = {
            text: 'Phụ đề mới',
            startMs: currentMs,
            endMs: currentMs + newDuration,
            timestampMs: currentMs + (newDuration / 2),
            confidence: 1,
        };

        setCaptions((prev) => [...prev, newCaption]);
        // Auto select new caption
        // We need to know the index in the UNSORTED array if we want to select it by index
        // But since we append, it will be the last index.
        setSelectedIndexes([captions.length]);

    }, [captions, audioDurationSec]);



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

    const handleGlobalClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // Check if click is on an interactive element
        if (target.closest('button, input, textarea, a, [data-interactive="true"]')) return;

        // If clicking inside Timeline or SubtitleSidebar (on their backgrounds), those components handle their own logic.
        // But if clicks bubble up here, it means they weren't handled (or were just background clicks).
        // However, we must be careful not to override component-specific behavior.
        // For now, let's just valid "empty space" clicks. 
        // A safe heuristic: if it's the main container or specific layout containers.

        if (selectedIndexes.length > 0) {
            setSelectedIndexes((prev) => prev.length ? [] : prev);
        }
    }, [selectedIndexes]);

    if (!mounted) return null;

    return (
        <div
            className="h-screen flex flex-col bg-background text-foreground font-sans overflow-hidden"
            onClick={handleGlobalClick}
        >
            {/* Header */}
            <header className="flex-shrink-0 px-6 py-3 flex justify-between items-center border-b border-border bg-card/50 backdrop-blur-sm z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                        <Music className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-primary">
                            Karaoke Generator
                        </h1>
                        <p className="text-muted-foreground text-xs">Studio Edition</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Theme Toggle */}
                    <div className="flex items-center bg-secondary/50 rounded-full p-1 border border-border">
                        <button
                            onClick={() => setTheme("light")}
                            className={`p-1.5 rounded-full transition-all ${theme === 'light' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Sun className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setTheme("system")}
                            className={`p-1.5 rounded-full transition-all ${theme === 'system' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Monitor className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setTheme("dark")}
                            className={`p-1.5 rounded-full transition-all ${theme === 'dark' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Moon className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="h-6 w-px bg-border mx-2" />

                    <div className="flex flex-col items-end gap-1 min-w-[150px]">
                        {renderProgress !== null && (
                            <div className="flex items-center gap-2 w-full">
                                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-300"
                                        style={{ width: `${renderProgress}%` }}
                                    />
                                </div>
                                <span className="text-xs font-mono text-primary">{renderProgress}%</span>
                            </div>
                        )}
                        {renderStatus && renderProgress === null && (
                            <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={renderStatus}>{renderStatus}</span>
                        )}
                        {(renderStartTime || renderDuration) && (
                            <span className="text-xs font-mono text-muted-foreground/80">
                                {renderProgress !== null ? formatTimer(elapsedTime) : `Time: ${renderDuration}`}
                            </span>
                        )}
                    </div>

                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download
                            target="_blank"
                            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-all bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={renderProgress !== null ? handleCancel : handleRender}
                        disabled={renderProgress !== null && !renderingId}
                        className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-all flex items-center gap-2 ${renderProgress !== null
                            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20'
                            }`}
                    >
                        {renderProgress !== null ? <X className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                        {renderProgress !== null ? 'Hủy Render' : 'Export Video'}
                    </button>
                </div>
            </header>

            {/* Main Layout - 3 Pane Grid */}
            <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr_320px] grid-rows-[1fr_280px] gap-0">
                {/* Left Sidebar - Settings */}
                <aside className="row-span-1 bg-card border-r border-border flex flex-col min-h-0 z-10">
                    <div className="p-4 border-b border-border">
                        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Settings className="w-3 h-3" /> Cấu hình
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                        {/* Audio Section */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Music className="w-4 h-4 text-muted-foreground" />
                                File Âm thanh
                            </div>

                            <div className="card-input-wrapper">
                                <input type="file" accept="audio/*" onChange={handleAudioChange} className="w-full text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 bg-secondary/50 rounded-lg border border-border text-foreground p-1" />
                            </div>
                            {(audioFileName || audioFile) && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 bg-secondary/30 p-2 rounded">
                                    <FileText className="w-3 h-3" />
                                    <span className="truncate">{audioFileName ?? audioFile?.name}</span>
                                </p>
                            )}
                        </section>

                        <div className="h-px bg-border my-2" />

                        {/* Background Section */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                Nền Video
                            </div>

                            <select
                                value={backgroundType}
                                onChange={(e) => setBackgroundType(e.target.value as BackgroundType)}
                                className="w-full bg-secondary/50 p-2 rounded-lg border border-border text-sm focus:ring-1 focus:ring-ring outline-none"
                            >
                                <option value="black">Màu đen (Mặc định)</option>
                                <option value="image">Hình ảnh</option>
                                <option value="video">Video</option>
                            </select>

                            {(backgroundType === 'image' || backgroundType === 'video') && (
                                <div className="space-y-4 animate-accordion-down">
                                    <input
                                        type="file"
                                        accept={backgroundType === 'image' ? 'image/*' : 'video/*'}
                                        onChange={handleBackgroundFile}
                                        className="w-full text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 bg-secondary/50 rounded-lg border border-border text-foreground p-1"
                                    />
                                    {(backgroundFileName || backgroundFile) && (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 bg-secondary/30 p-2 rounded">
                                            <FileText className="w-3 h-3" />
                                            <span className="truncate">{backgroundFileName ?? backgroundFile?.name}</span>
                                        </p>
                                    )}

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Độ mờ nền</span>
                                            <span className="font-mono">{Math.round(backgroundDim * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={backgroundDim}
                                            onChange={(e) => setBackgroundDim(Number(e.target.value))}
                                            className="w-full accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {backgroundType === 'video' && (
                                        <div className="p-3 bg-secondary/20 rounded-lg border border-border space-y-3">
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-muted-foreground">Bắt đầu từ (s)</span>
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
                                                    className="w-full bg-background p-1.5 rounded border border-border text-sm"
                                                    disabled={!videoDurationSec}
                                                />
                                            </div>

                                            <label className="flex items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={videoLoop}
                                                    onChange={(e) => setVideoLoop(e.target.checked)}
                                                    className="rounded border-border bg-background text-primary focus:ring-ring"
                                                />
                                                Lặp lại video (Loop)
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        <div className="h-px bg-border my-2" />

                        {/* Typography Section */}
                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Type className="w-4 h-4 text-muted-foreground" />
                                Typography
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <label className="space-y-1.5">
                                    <span className="text-xs text-muted-foreground">Màu đã hát</span>
                                    <div className="flex items-center gap-2 p-1 bg-secondary/50 border border-border rounded-lg">
                                        <input
                                            type="color"
                                            value={sungColor}
                                            onChange={(e) => setSungColor(e.target.value)}
                                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                                        />
                                        <span className="text-xs font-mono uppercase">{sungColor}</span>
                                    </div>
                                </label>
                                <label className="space-y-1.5">
                                    <span className="text-xs text-muted-foreground">Màu chưa hát</span>
                                    <div className="flex items-center gap-2 p-1 bg-secondary/50 border border-border rounded-lg">
                                        <input
                                            type="color"
                                            value={unsungColor}
                                            onChange={(e) => setUnsungColor(e.target.value)}
                                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                                        />
                                        <span className="text-xs font-mono uppercase">{unsungColor}</span>
                                    </div>
                                </label>
                            </div>

                            <div className="space-y-1.5">
                                <span className="text-xs text-muted-foreground">Font chữ</span>
                                <select
                                    value={fontFamily}
                                    onChange={(e) => setFontFamily(e.target.value)}
                                    className="w-full bg-input text-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                    <option value="Roboto">Roboto</option>
                                    <option value="Inter Tight">Inter Tight</option>
                                    <option value="Arial">Arial</option>
                                    <option value="Times New Roman">Times</option>
                                    <option value="Lora">Lora</option>
                                    <option value="Montserrat">Montserrat</option>
                                    <option value="Oswald">Oswald</option>
                                    <option value="Playfair Display">Playfair Display</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                    <span className="text-xs text-muted-foreground">Cỡ chữ (px)</span>
                                    <input
                                        type="number"
                                        min={24}
                                        max={120}
                                        value={fontSize}
                                        onChange={(e) => setFontSize(e.target.value)}
                                        className="w-full bg-secondary/50 p-2 rounded-lg border border-border text-sm"
                                    />
                                </div>
                                <div className="flex items-end pb-2">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={enableShadow}
                                            onChange={(e) => setEnableShadow(e.target.checked)}
                                            className="rounded border-border bg-background text-primary"
                                        />
                                        Drop Shadow
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-1.5 pt-2">
                                <span className="text-xs text-muted-foreground">Bố cục lời</span>
                                <div className="flex bg-secondary/50 p-1 rounded-lg border border-border">
                                    <button
                                        onClick={() => setLyricsLayout('traditional')}
                                        className={`flex-1 text-xs py-1.5 rounded-md transition-all ${lyricsLayout === 'traditional' ? 'bg-background shadow text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Truyền thống
                                    </button>
                                    <button
                                        onClick={() => setLyricsLayout('bottom')}
                                        className={`flex-1 text-xs py-1.5 rounded-md transition-all ${lyricsLayout === 'bottom' ? 'bg-background shadow text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Căn giữa
                                    </button>
                                </div>
                            </div>
                        </section>

                    </div>
                </aside>

                {/* Center - Player Preview */}
                <main className="col-start-2 row-start-1 bg-secondary/20 flex flex-col min-w-0 overflow-hidden relative">
                    <div className="flex-1 p-8 flex items-center justify-center overflow-hidden">
                        <div className="aspect-video h-full max-h-full bg-black shadow-2xl rounded-lg overflow-hidden border border-border/50 relative group">
                            {currentAudioSrc ? (
                                <Player
                                    acknowledgeRemotionLicense
                                    ref={setPlayerCallback}
                                    component={KaraokeComposition}
                                    inputProps={playerProps}
                                    durationInFrames={durationInFrames}
                                    fps={FPS}
                                    compositionWidth={WIDTH}
                                    compositionHeight={HEIGHT}
                                    style={{ width: '100%', height: '100%' }}
                                    controls
                                    loop
                                    className="w-full h-full"
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                                    <Music className="w-16 h-16 mb-4 opacity-20" />
                                    <p>Chọn file âm thanh để bắt đầu</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Render Options Quick Bar */}
                    <div className="flex-shrink-0 px-6 py-2 bg-card border-t border-border flex justify-between items-center text-xs">
                        <div className="flex items-center gap-4">
                            <span className="text-muted-foreground font-medium uppercase tracking-wider">Render Settings:</span>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">CRF: {crf}</span>
                                <input
                                    type="range"
                                    min={10}
                                    max={40}
                                    step={1}
                                    value={crf}
                                    onChange={(e) => setCrf(Number(e.target.value))}
                                    className="w-24 accent-primary h-1 bg-secondary rounded cursor-pointer"
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={renderSample}
                                    onChange={(e) => setRenderSample(e.target.checked)}
                                    className="rounded border-border bg-background text-primary"
                                />
                                Preview (30s)
                            </label>
                        </div>
                        <div className="text-muted-foreground">
                            {WIDTH}x{HEIGHT} • {FPS}fps
                        </div>
                    </div>
                </main>

                {/* Right Sidebar - Subtitles */}
                <aside className="col-start-3 row-start-1 row-span-2 bg-card border-l border-border flex flex-col w-full h-full overflow-hidden z-10">
                    <SubtitleSidebar
                        captions={captions}
                        onUpdateCaption={handleUpdateCaptionText}
                        player={player}
                        onImportSrt={handleSrtFile}
                        onExportSrt={handleExportSrt}
                    />
                </aside>

                {/* Bottom - Timeline */}
                <section className="col-span-2 row-start-2 h-[280px] bg-card border-t border-border flex flex-col z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    <div className="flex-shrink-0 px-4 py-2 border-b border-border flex justify-between items-center bg-secondary/10">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <Layers className="w-3 h-3" /> Timeline
                            </h2>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-secondary rounded-lg border border-border overflow-hidden">
                                <button onClick={handleZoomOut} className="px-3 py-1 text-xs hover:bg-background transition-colors">-</button>
                                <span className="text-[10px] px-2 text-muted-foreground font-mono border-x border-border min-w-[60px] text-center">
                                    {(zoom / FPS).toFixed(1)}x
                                </span>
                                <button onClick={handleZoomIn} className="px-3 py-1 text-xs hover:bg-background transition-colors">+</button>
                            </div>

                            <div className="h-4 w-px bg-border mx-2" />

                            <button
                                onClick={() => addCaption()}
                                className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium transition-all"
                            >
                                + Thêm Sub
                            </button>

                            {selectedIndexes.length > 0 ? (
                                <button
                                    onClick={handleClearCaptions}
                                    className="px-3 py-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md text-xs font-medium transition-all"
                                >
                                    Xóa ({selectedIndexes.length})
                                </button>
                            ) : (
                                <button
                                    onClick={handleClearCaptions}
                                    className="px-3 py-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md text-xs font-medium transition-all"
                                    title="Xóa tất cả"
                                >
                                    Xóa hết
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 relative overflow-hidden flex flex-col bg-background/50">
                        {timelineWarning && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg text-xs font-bold shadow-lg animate-in fade-in slide-in-from-top-2 pointer-events-none flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                {timelineWarning}
                            </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                            <Timeline
                                audioUrl={currentAudioSrc}
                                captions={captions}
                                player={player}
                                duration={audioDurationSec || 30}
                                selectedIndexes={selectedIndexes}
                                onSelect={setSelectedIndexes}
                                onUpdateCaption={(index, newCaption) => {
                                    setCaptions(prev => prev.map((c, i) => i === index ? newCaption : c));
                                }}
                                zoom={zoom}
                                onZoom={handleSetZoom}
                            />
                        </div>
                    </div>
                </section>
            </div>
        </div >
    );
}

