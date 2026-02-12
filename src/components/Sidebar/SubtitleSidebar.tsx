import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { KaraokeCaption } from '../../types/karaoke';
import { PlayerRef } from '@remotion/player';

interface SubtitleSidebarProps {
    captions: KaraokeCaption[];
    onUpdateCaption: (index: number, newText: string) => void;
    player: PlayerRef | null;
}

// Hook to subscribe to player frame updates
const usePlayerFrame = (player: PlayerRef | null) => {
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

// Helper: Format ms to mm:ss.ms
function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

const FPS = 30; // Assuming 30 FPS as constant

export const SubtitleSidebar: React.FC<SubtitleSidebarProps> = ({
    captions,
    onUpdateCaption,
    player,
}) => {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const currentFrame = usePlayerFrame(player);
    const currentTime = (currentFrame / FPS) * 1000;

    // Find active index
    const activeCaptionIndex = captions.findIndex(
        (cap) => currentTime >= cap.startMs && currentTime < cap.endMs
    );

    // Auto-scroll to active item
    useEffect(() => {
        if (activeCaptionIndex !== -1 && editingIndex === null) {
            const el = document.getElementById(`subtitle-item-${activeCaptionIndex}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeCaptionIndex, editingIndex]);

    // Auto-focus when entering edit mode
    useEffect(() => {
        if (editingIndex !== null && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingIndex]);

    const handleStartEdit = (index: number, text: string) => {
        setEditingIndex(index);
        setEditText(text);
    };

    const handleSave = () => {
        if (editingIndex !== null) {
            onUpdateCaption(editingIndex, editText);
            setEditingIndex(null);
        }
    };

    const handleCancel = () => {
        setEditingIndex(null);
        setEditText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    const onSeek = (timeMs: number) => {
        if (player) {
            player.seekTo((timeMs / 1000) * FPS);
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Danh sách phụ đề ({captions.length})</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {captions.length === 0 ? (
                    <div className="text-center text-zinc-500 py-8 text-sm">
                        Chưa có phụ đề nào.
                        <br />
                        Thêm phụ đề từ Timeline hoặc nhập file SRT.
                    </div>
                ) : (
                    captions.map((cap, index) => {
                        const isCurrent = currentTime >= cap.startMs && currentTime < cap.endMs;
                        const isEditing = editingIndex === index;

                        return (
                            <div
                                key={index}
                                id={`subtitle-item-${index}`}
                                className={`p-3 rounded-lg border transition-all ${isCurrent ? 'bg-zinc-800 border-green-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <button
                                        onClick={() => onSeek(cap.startMs)}
                                        className="text-xs font-mono text-cyan-500 hover:text-cyan-400 bg-cyan-950/30 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                        title="Click để nhảy đến thời gian này"
                                    >
                                        {formatTime(cap.startMs)}
                                    </button>
                                    <span className="text-[10px] text-zinc-600">#{index + 1}</span>
                                </div>

                                {isEditing ? (
                                    <div className="relative">
                                        <textarea
                                            ref={inputRef}
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            onBlur={handleSave}
                                            className="w-full bg-black text-white p-2 rounded border border-blue-500 text-sm focus:outline-none min-h-[60px] resize-y"
                                            placeholder="Nhập nội dung phụ đề..."
                                        />
                                        <div className="text-[10px] text-zinc-500 mt-1 flex justify-between">
                                            <span>Enter để lưu</span>
                                            <span>Esc để hủy</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => handleStartEdit(index, cap.text)}
                                        className="text-sm text-zinc-300 hover:text-white cursor-pointer hover:bg-zinc-800/50 p-1 -m-1 rounded transition-colors break-words whitespace-pre-wrap"
                                        title="Click để sửa nội dung"
                                    >
                                        {cap.text || <span className="text-zinc-600 italic">Trống</span>}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
