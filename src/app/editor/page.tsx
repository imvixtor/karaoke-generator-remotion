'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Player } from '@remotion/player';
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

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export default function EditorPage() {
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [srtContent, setSrtContent] = useState('');
    const [captions, setCaptions] = useState<KaraokeCaption[]>([]);
    const [backgroundType, setBackgroundType] = useState<BackgroundType>('black');
    const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [sungColor, setSungColor] = useState('#00ff88');
    const [unsungColor, setUnsungColor] = useState('#ffffff');
    const [fontSize, setFontSize] = useState(65);
    const [enableShadow, setEnableShadow] = useState(true);
    const [enableScrollAnimation, setEnableScrollAnimation] = useState(false);
    const [backgroundDim, setBackgroundDim] = useState(0.60);
    const [backgroundBlur, setBackgroundBlur] = useState(30);
    const [backgroundVideoStartTime, setBackgroundVideoStartTime] = useState(0);
    const [renderStatus, setRenderStatus] = useState<string | null>(null);

    const currentAudioSrc = audioUrl ?? '';
    const audioDurationSec = useAudioDuration(currentAudioSrc || null);
    const durationInFrames = audioDurationSec != null ? Math.ceil(audioDurationSec * FPS) : 30 * FPS;
    const videoDurationSec = useVideoDuration(backgroundType === 'video' ? (backgroundUrl ?? null) : null);

    const handleAudioChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setAudioFile(null);
            setAudioUrl(null);
            return;
        }
        setAudioFile(file);
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
            setSrtContent(text);
            const lower = file.name.toLowerCase();
            if (lower.endsWith('.ass')) {
                setCaptions(parseAssContent(text));
            } else {
                setCaptions(parseSrtContent(text));
            }
        };
        reader.readAsText(file, 'utf-8');
    }, []);

    const handlePasteSrt = useCallback(() => {
        if (!srtContent.trim()) return;
        const txt = srtContent;
        // Nếu có [Script Info] hoặc [Events], coi là ASS
        if (/\[Events]/i.test(txt) || /\[Script Info]/i.test(txt)) {
            setCaptions(parseAssContent(txt));
        } else {
            setCaptions(parseSrtContent(txt));
        }
    }, [srtContent]);

    const handleBackgroundFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setBackgroundFile(null);
            setBackgroundUrl(null);
            return;
        }
        setBackgroundFile(file);
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

    const addCaptionAtStart = useCallback(() => {
        const newStart = 0;
        const newEnd = 3000;
        setCaptions((prev) => [
            {
                text: 'Phụ đề mới',
                startMs: newStart,
                endMs: newEnd,
                timestampMs: (newStart + newEnd) / 2,
                confidence: 1,
            },
            ...prev,
        ]);
    }, []);

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

    // Lưu vào localStorage khi có thay đổi (thay vì sessionStorage để persist lâu hơn, hoặc giữ session)
    useEffect(() => {
        const data = {
            srtContent,
            captions,
            backgroundType,
            backgroundDim,
            backgroundBlur,
            backgroundVideoStartTime,
            sungColor,
            unsungColor,
            fontSize,
            enableShadow,
            enableScrollAnimation,
            audioUrl,
            backgroundUrl,
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, [srtContent, captions, backgroundType, backgroundDim, backgroundBlur, backgroundVideoStartTime, sungColor, unsungColor, fontSize, enableShadow, audioUrl, backgroundUrl]);

    // Load từ sessionStorage khi mount
    useEffect(() => {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.srtContent) setSrtContent(data.srtContent);
                if (data.captions) setCaptions(data.captions);
                if (data.backgroundType) setBackgroundType(data.backgroundType);
                if (data.backgroundDim !== undefined) setBackgroundDim(data.backgroundDim);
                if (data.backgroundBlur !== undefined) setBackgroundBlur(data.backgroundBlur);
                if (data.backgroundVideoStartTime !== undefined) setBackgroundVideoStartTime(data.backgroundVideoStartTime);
                if (data.sungColor) setSungColor(data.sungColor);
                if (data.unsungColor) setUnsungColor(data.unsungColor);
                if (data.fontSize) setFontSize(data.fontSize);
                if (data.enableShadow !== undefined) setEnableShadow(data.enableShadow);
                if (data.audioUrl) setAudioUrl(data.audioUrl);
                if (data.backgroundUrl) setBackgroundUrl(data.backgroundUrl);
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
        backgroundBlur,
        backgroundVideoStartTime,
        backgroundVideoDuration: videoDurationSec ?? undefined,
        sungColor,
        unsungColor,
        fontSize,
        enableShadow,
        enableScrollAnimation,
        fps: FPS,
    };

    const handleRender = useCallback(async () => {
        if (!currentAudioSrc) {
            alert('Vui lòng chọn file âm thanh trước khi render.');
            return;
        }
        if (captions.length === 0) {
            alert('Vui lòng thêm phụ đề trước khi render.');
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
            const resp = await fetch('/api/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inputProps),
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const json = await resp.json();
            if (json.success) {
                setRenderStatus(`Render xong: ${json.filename}`);
            } else {
                setRenderStatus(`Render thất bại: ${json.error}`);
            }
        } catch (e) {
            console.error(e);
            setRenderStatus('Render thất bại. Kiểm tra console.');
        }
    }, [playerProps]);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-200 p-8 font-sans">
            <header className="mb-8 border-b border-zinc-800 pb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-green-500 mb-2">
                        Karaoke Generator
                    </h1>
                    <p className="text-zinc-400 text-sm">Chỉnh sửa phụ đề, nền và xuất video với Remotion</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    {renderStatus && <span className="text-sm font-mono text-cyan-400 animate-pulse">{renderStatus}</span>}
                    <button
                        type="button"
                        onClick={handleRender}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-400 hover:from-green-700 hover:to-green-500 text-black font-bold rounded-lg shadow-lg hover:shadow-xl transition-all"
                    >
                        Render Video
                    </button>
                </div>
            </header>

            <div className="flex flex-wrap gap-8">
                <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">
                    <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-4 tracking-wider">Âm thanh</h2>
                        <input type="file" accept="audio/*" onChange={handleAudioChange} className="w-full text-sm bg-zinc-800 p-2 rounded mb-2 border border-zinc-700" />
                        {audioFile && <p className="text-xs text-zinc-500 truncate">{audioFile.name}</p>}
                    </section>

                    <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-4 tracking-wider">Phụ đề (SRT / ASS)</h2>
                        <input type="file" accept=".srt,.ass,text/plain" onChange={handleSrtFile} className="w-full text-sm bg-zinc-800 p-2 rounded mb-2 border border-zinc-700" />
                        <textarea
                            placeholder="Dán nội dung SRT hoặc chọn file..."
                            value={srtContent}
                            onChange={(e) => setSrtContent(e.target.value)}
                            className="w-full h-24 bg-zinc-800 p-2 rounded mb-2 border border-zinc-700 text-xs font-mono"
                        />
                        <button type="button" onClick={handlePasteSrt} className="w-full py-2 bg-green-500 hover:bg-green-600 text-zinc-950 font-bold rounded text-sm transition-colors">
                            Áp dụng SRT
                        </button>
                        <p className="text-xs text-zinc-500 mt-2">{captions.length} dòng phụ đề</p>
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
                                {backgroundFile && <p className="text-xs text-zinc-500 truncate">{backgroundFile.name}</p>}

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

                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span>Độ blur nền</span>
                                        <span>{Math.round(backgroundBlur)}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={backgroundBlur}
                                        onChange={(e) => setBackgroundBlur(Number(e.target.value))}
                                        className="w-full accent-green-500"
                                    />
                                </div>

                                {backgroundType === 'video' && (
                                    <>
                                        <div>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span>Bắt đầu video từ</span>
                                                <span>{backgroundVideoStartTime.toFixed(1)}s</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={0}
                                                max={videoDurationSec ? Math.max(0, videoDurationSec - 1) : 0}
                                                step={0.1}
                                                value={backgroundVideoStartTime}
                                                onChange={(e) => setBackgroundVideoStartTime(Number(e.target.value))}
                                                className="w-full accent-green-500"
                                                disabled={!videoDurationSec}
                                            />
                                        </div>
                                        {videoDurationSec && (
                                            <p className="text-xs text-zinc-500">
                                                Video: {videoDurationSec.toFixed(1)}s |
                                                Audio: {audioDurationSec?.toFixed(1) ?? '?'}s
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-4 tracking-wider">Màu sắc UI</h2>
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
                                onChange={(e) => setFontSize(Number(e.target.value))}
                                className="w-full bg-zinc-800 p-2 rounded border border-zinc-700 text-sm"
                            />
                        </label>
                        <div className="mt-4">
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={enableShadow}
                                    onChange={(e) => setEnableShadow(e.target.checked)}
                                    className="rounded bg-zinc-800 border-zinc-700 accent-green-500"
                                />
                                Bật đổ bóng (Drop Shadow)
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={enableScrollAnimation}
                                    onChange={(e) => setEnableScrollAnimation(e.target.checked)}
                                    className="rounded bg-zinc-800 border-zinc-700 accent-green-500"
                                />
                                Bật animation cuộn
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
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center cursor-pointer bg-zinc-800/50">
                            <span className="font-bold text-sm">Chỉnh sửa phụ đề ({captions.length} dòng)</span>
                            <div className="flex gap-2">
                                <button type="button" onClick={addCaptionAtStart} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                                    + Đầu
                                </button>
                                <button type="button" onClick={() => addCaption()} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-black font-bold rounded text-xs">
                                    + Cuối
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[500px] overflow-y-auto p-2 space-y-2 scroller">
                            {captions.length === 0 ? (
                                <p className="text-center text-zinc-500 py-8 text-sm">Chưa có phụ đề.</p>
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
                                                className="w-6 h-6 flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-xs"
                                                title="Xóa"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Render section moved to header */}
                </div>
            </div>
        </div>
    );
}
