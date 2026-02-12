import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { KaraokeCaption } from '../../types/karaoke';
import { PlayerRef } from '@remotion/player';
import { Upload, Download, List, Clock, Edit2, Trash2 } from 'lucide-react';

interface SubtitleSidebarProps {
    captions: KaraokeCaption[];
    onUpdateCaption: (index: number, newText: string) => void;
    player: PlayerRef | null;
    onImportSrt: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onExportSrt: () => void;
    onDeleteCaption: (index: number) => void;
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
    onImportSrt,
    onExportSrt,
    onDeleteCaption,
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
        <div className="flex flex-col h-full bg-card min-h-0 w-full overflow-hidden border-l border-border">
            <div className="p-4 border-b border-border flex-shrink-0 flex justify-between items-center bg-secondary/10">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <List className="w-3 h-3" /> Phụ đề ({captions.length})
                </h3>
                <div className="flex items-center gap-1">
                    <label className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Nhập SRT">
                        <Upload className="w-4 h-4" />
                        <input type="file" accept=".srt,.ass,text/plain" onChange={onImportSrt} className="hidden" />
                    </label>
                    <button
                        onClick={onExportSrt}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Xuất SRT"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar bg-background/50">
                {captions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground/50 py-12 text-sm text-center px-4">
                        <List className="w-12 h-12 mb-3 opacity-20" />
                        <p>Chưa có phụ đề nào.</p>
                        <p className="text-xs mt-1">Thêm từ Timeline hoặc nhập file SRT.</p>
                    </div>
                ) : (
                    captions.map((cap, index) => {
                        const isCurrent = currentTime >= cap.startMs && currentTime < cap.endMs;
                        const isEditing = editingIndex === index;

                        return (
                            <div
                                key={index}
                                id={`subtitle-item-${index}`}
                                className={`p-3 rounded-lg border transition-all relative group ${isCurrent
                                    ? 'bg-primary/10 border-primary/50 shadow-sm'
                                    : 'bg-card border-border hover:border-border/80 hover:bg-secondary/30'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onSeek(cap.startMs); }}
                                        className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20 transition-colors flex items-center gap-1"
                                        title="Click để nhảy đến thời gian này"
                                    >
                                        <Clock className="w-3 h-3" />
                                        {formatTime(cap.startMs)}
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDeleteCaption(index); }}
                                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-secondary opacity-0 group-hover:opacity-100"
                                            title="Xóa phụ đề này"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                        <span className="text-[10px] text-muted-foreground font-medium">#{index + 1}</span>
                                    </div>
                                </div>

                                {isEditing ? (
                                    <div className="relative animate-in fade-in zoom-in-95 duration-200">
                                        <textarea
                                            ref={inputRef}
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            onBlur={handleSave}
                                            className="w-full bg-input text-foreground p-2 rounded-md border border-ring/50 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px] resize-y"
                                            placeholder="Nhập nội dung phụ đề..."
                                        />
                                        <div className="text-[10px] text-muted-foreground mt-1 flex justify-between px-1">
                                            <span>Enter để lưu</span>
                                            <span className="text-destructive cursor-pointer hover:underline" onClick={handleCancel}>Hủy (Esc)</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onClick={(e) => { e.stopPropagation(); handleStartEdit(index, cap.text); }}
                                        className="text-sm text-foreground/90 hover:text-foreground cursor-pointer hover:bg-secondary/50 p-1.5 -m-1.5 rounded transition-colors break-words whitespace-pre-wrap relative"
                                        title="Click để sửa nội dung"
                                    >
                                        {cap.text || <span className="text-muted-foreground italic opacity-50">Trống</span>}
                                        <Edit2 className="w-3 h-3 absolute top-2 right-2 opacity-0 group-hover:opacity-50 transition-opacity text-muted-foreground" />
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
