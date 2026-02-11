<section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 flex flex-col h-[600px]">
    <div className="flex justify-between items-center mb-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Timeline Editor</h2>
            {/* Clock Display */}
            {currentAudioSrc ? (
                <TimeDisplay playerRef={playerRef} fps={FPS} />
            ) : (
                <div className="font-mono text-cyan-400 font-bold bg-zinc-900 px-3 py-1 rounded border border-zinc-700 shadow-inner text-xs">
                    00:00.00
                </div>
            )}
        </div>

        <div className="flex gap-2">
            <button
                onClick={() => addCaption()}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold"
            >
                + Thêm Sub
            </button>
            <button
                onClick={handleClearCaptions}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold"
            >
                Xóa hết
            </button>
            <div className="w-px bg-zinc-700 mx-1"></div>
            <button
                onClick={handleExportSrt}
                className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs"
            >
                Xuất SRT
            </button>
            <label className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs cursor-pointer flex items-center gap-1">
                <span>Nhập SRT</span>
                <input type="file" accept=".srt,.ass,text/plain" onChange={handleSrtFile} className="hidden" />
            </label>
        </div>
    </div>

    <div className="flex-1 flex flex-col min-h-0">
        {/* Timeline Component */}
        <Timeline
            audioUrl={currentAudioSrc}
            captions={captions}
            currentTime={(useCurrentPlayerFrame(playerRef) / FPS)}
            duration={audioDurationSec || 30}
            onSeek={(time) => {
                if (playerRef.current) {
                    playerRef.current.seekTo(time * FPS);
                }
            }}
            onUpdateCaption={(index, newCaption) => {
                setCaptions(prev => prev.map((c, i) => i === index ? newCaption : c));
            }}
        />
    </div>
</section>
