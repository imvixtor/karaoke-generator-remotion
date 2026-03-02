"use client";

import React, { useState, useRef } from "react";
import { toJpeg } from "html-to-image";
import { Download, Upload, Image as ImageIcon, Music, Youtube, Wand2, RefreshCw, Palette, Link as LinkIcon, ZoomIn, MoveHorizontal, MoveVertical } from "lucide-react";

export function ThumbnailGenerator() {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [frames, setFrames] = useState<string[]>([]);
    const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);

    const [title, setTitle] = useState("VỀ ĐÂU MÁI TÓC NGƯỜI THƯƠNG");
    const [channelName, setChannelName] = useState("TCK Kara");
    const [extraInfo, setExtraInfo] = useState("KARAOKE HẠ TONE");
    const [themeColor, setThemeColor] = useState("#ec4899");
    const [bgScale, setBgScale] = useState(1);
    const [bgPosX, setBgPosX] = useState(50); // percentage 0-100
    const [bgPosY, setBgPosY] = useState(50); // percentage 0-100
    const [imageUrlInput, setImageUrlInput] = useState("");

    const previewRef = useRef<HTMLDivElement>(null);
    const hiddenVideoRef = useRef<HTMLVideoElement>(null);

    const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVideoFile(file);
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            setFrames([]);
            setSelectedFrame(null);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setSelectedFrame(url);
        }
    };

    const handleApplyImageUrl = () => {
        if (imageUrlInput) {
            setSelectedFrame(imageUrlInput);
        }
    };

    const extractFrames = async () => {
        if (!hiddenVideoRef.current || !videoUrl) return;
        setIsExtracting(true);
        const video = hiddenVideoRef.current;

        try {
            if (video.readyState < 1) {
                await new Promise((resolve) => {
                    video.onloadedmetadata = resolve;
                });
            }

            const duration = video.duration;
            if (!duration || !isFinite(duration)) {
                alert("Không thể đọc thời lượng video. Vui lòng thử video khác.");
                setIsExtracting(false);
                return;
            }

            // Pick 10 random times
            const times = Array.from({ length: 10 }, () => Math.random() * duration);
            times.sort((a, b) => a - b);

            const newFrames: string[] = [];
            const canvas = document.createElement("canvas");
            // Set fixed 1280x720 aspect ratio instead of actual video if we want standard 16:9 thumbnails
            // Or use actual video dimensions
            canvas.width = video.videoWidth > 0 ? video.videoWidth : 1280;
            canvas.height = video.videoHeight > 0 ? video.videoHeight : 720;
            const ctx = canvas.getContext("2d");

            for (const time of times) {
                await new Promise((resolve, reject) => {
                    video.onseeked = resolve;
                    video.onerror = reject;
                    video.currentTime = time;
                });
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    newFrames.push(canvas.toDataURL("image/jpeg", 0.7));
                }
            }

            setFrames(newFrames);
            if (newFrames.length > 0) {
                setSelectedFrame(newFrames[0]);
            }
        } catch (error) {
            console.error("Lỗi khi trích xuất frame:", error);
            alert("Có lỗi xảy ra khi trích xuất hình ảnh từ video.");
        } finally {
            setIsExtracting(false);
        }
    };

    const handleDownload = async () => {
        if (!previewRef.current) return;

        // Temporarily remove any rounding classes before generating for perfect edges
        const isRounded = previewRef.current.classList.contains("rounded-2xl");
        if (isRounded) {
            previewRef.current.classList.remove("rounded-2xl");
            previewRef.current.classList.remove("overflow-hidden");
        }

        try {
            const dataUrl = await toJpeg(previewRef.current, {
                quality: 0.9,
                pixelRatio: 2, // High resolution
                backgroundColor: "#000000"
            });

            const link = document.createElement("a");
            link.download = `karaoke-thumbnail-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.jpg`;
            link.href = dataUrl;
            link.click();
        } finally {
            if (isRounded) {
                previewRef.current.classList.add("rounded-2xl");
                previewRef.current.classList.add("overflow-hidden");
            }
        }
    };

    return (
        <div className="w-full max-w-[1600px] mx-auto py-10 px-4 md:px-8 space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2 flex items-center gap-2">
                        <Wand2 className="w-8 h-8 text-pink-500" />
                        Tạo Thumbnail Karaoke
                    </h1>
                    <p className="text-gray-400">Tự động trích xuất hình ảnh từ video và tạo ảnh bìa chuyên nghiệp.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8">
                {/* Left Column: Form & Gallery */}
                <div className="xl:col-span-3 space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800 shadow-xl backdrop-blur-sm">

                    <div className="space-y-4">
                        <div className="text-sm font-medium text-gray-400 mb-2">1. Chọn Nền (Video, Ảnh, hoặc Link)</div>

                        {/* Video Upload */}
                        <label className="block border-2 border-dashed border-gray-700 hover:border-pink-500 bg-gray-950/50 transition-colors duration-200 rounded-xl p-4 cursor-pointer text-center group">
                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleVideoChange}
                                className="hidden"
                            />
                            <Upload className="w-6 h-6 mx-auto text-gray-500 mb-2 group-hover:text-pink-400 transition-colors" />
                            <span className="text-gray-300 font-semibold text-sm block mb-1">
                                {videoFile ? videoFile.name : "Tải lên Video để trích xuất khung hình"}
                            </span>
                        </label>

                        {/* Image Upload */}
                        <label className="block border-2 border-dashed border-gray-700 hover:border-pink-500 bg-gray-950/50 transition-colors duration-200 rounded-xl p-4 cursor-pointer text-center group">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                            <ImageIcon className="w-6 h-6 mx-auto text-gray-500 mb-2 group-hover:text-pink-400 transition-colors" />
                            <span className="text-gray-300 font-semibold text-sm block mb-1">
                                Tải lên Hình Ảnh (từ thiết bị)
                            </span>
                        </label>

                        {/* Image URL */}
                        <div className="flex flex-col 2xl:flex-row gap-2">
                            <input
                                type="text"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-pink-500 transition-colors"
                                value={imageUrlInput}
                                onChange={(e) => setImageUrlInput(e.target.value)}
                                placeholder="Hoặc dán link hình ảnh vào đây..."
                            />
                            <button
                                onClick={handleApplyImageUrl}
                                className="w-full 2xl:w-auto px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium border border-gray-700 flex items-center justify-center gap-2"
                            >
                                <LinkIcon className="w-4 h-4" />
                                Áp dụng
                            </button>
                        </div>

                        {videoUrl && (
                            <button
                                onClick={extractFrames}
                                disabled={isExtracting}
                                className="w-full py-3 px-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-xl font-bold shadow-lg shadow-pink-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                            >
                                {isExtracting ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        Đang xử lý...
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon className="w-5 h-5" />
                                        Bắt đầu trích xuất ngẫu nhiên 10 khung hình
                                    </>
                                )}
                            </button>
                        )}

                        {/* Hidden Video element for extraction */}
                        {videoUrl && (
                            <video
                                ref={hiddenVideoRef}
                                src={videoUrl}
                                className="hidden"
                                muted
                                playsInline
                                crossOrigin="anonymous"
                            />
                        )}
                    </div>

                    {frames.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="font-semibold text-gray-300 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-purple-400" />
                                Khung hình lấy được
                            </h3>
                            <div className="grid grid-cols-5 gap-2">
                                {frames.map((frame, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedFrame(frame)}
                                        className={`relative aspect-video rounded-md overflow-hidden border-2 transition-all duration-200 ${selectedFrame === frame
                                            ? "border-pink-500 scale-105 shadow-md shadow-pink-500/30 z-10"
                                            : "border-transparent opacity-70 hover:opacity-100"
                                            }`}
                                    >
                                        <img src={frame} alt={`Frame ${idx}`} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Middle Column: Live Preview */}
                <div className="xl:col-span-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white uppercase tracking-wider">Xem trước</h2>
                        <button
                            onClick={handleDownload}
                            disabled={!selectedFrame}
                            className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-full font-bold shadow-lg shadow-pink-900/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all transform active:scale-95"
                        >
                            <Download className="w-4 h-4" />
                            Tải Xuống Ảnh Tỷ Lệ 16:9
                        </button>
                    </div>

                    <div className="w-full relative shadow-2xl rounded-2xl overflow-hidden shadow-black min-h-[400px] flex items-center justify-center bg-gray-900 ring-1 ring-gray-800">
                        {/* The scaled container that handles the 16:9 ratio properly for canvas rendering */}
                        {/* We use a fixed absolute size container and scale it visually via container query, or just let it resize with tailwind fluidly */}
                        {selectedFrame ? (
                            <div
                                ref={previewRef}
                                className="relative w-full aspect-video bg-black overflow-hidden select-none"
                            >
                                {/* Background Image Layer */}
                                <div
                                    className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
                                >
                                    <img
                                        src={selectedFrame}
                                        alt="Background"
                                        className="w-full h-full object-cover max-w-none"
                                        style={{
                                            transform: `scale(${bgScale}) translate(${(bgPosX - 50) / bgScale}%, ${(bgPosY - 50) / bgScale}%)`,
                                            transition: 'transform 0.1s ease-out'
                                        }}
                                        crossOrigin="anonymous"
                                    />
                                </div>

                                {/* Dark gradient overlay to make text pop */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>

                                {/* Extra Info Badge */}
                                {extraInfo && (
                                    <div
                                        className="absolute top-6 left-6 md:top-8 md:left-8 px-4 py-1.5 md:px-6 md:py-2 rounded-full border border-white/30 backdrop-blur-md transform -rotate-2"
                                        style={{
                                            backgroundColor: themeColor,
                                            boxShadow: `0 8px 20px -4px ${themeColor}80, inset 0 2px 4px rgba(255,255,255,0.4)`
                                        }}
                                    >
                                        <span className="text-white font-black tracking-widest text-sm md:text-base lg:text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)] uppercase">
                                            {extraInfo}
                                        </span>
                                    </div>
                                )}

                                {/* Channel Badge (Top Right) */}
                                {channelName && (
                                    <div className="absolute top-4 right-4 md:top-6 md:right-6 max-w-[50%] flex justify-end z-20">
                                        <h3 className="text-xl md:text-2xl lg:text-2xl xl:text-3xl 2xl:text-4xl font-black text-white text-right uppercase tracking-wider truncate"
                                            style={{
                                                textShadow: `
                                                    2px 2px 0 ${themeColor},
                                                    -2px -2px 0 ${themeColor},
                                                    2px -2px 0 ${themeColor},
                                                    -2px 2px 0 ${themeColor}
                                                `,
                                                WebkitTextStroke: `1px ${themeColor}`
                                            }}
                                        >
                                            {channelName}
                                        </h3>
                                    </div>
                                )}

                                {/* Content */}
                                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 flex flex-col items-center text-center pb-12 md:pb-16">

                                    <h2 className="text-2xl md:text-4xl lg:text-4xl xl:text-5xl 2xl:text-6xl font-black text-white text-center leading-tight tracking-tight uppercase relative z-10 w-full px-4 mx-auto block break-words"
                                        style={{
                                            // A combination of text shadows to create a shiny stroke/3D effect compatible with html2canvas
                                            // Enhanced with a glowing aura using the theme color
                                            textShadow: `
                                    0 0 20px ${themeColor}aa,
                                    0 0 40px ${themeColor}80,
                                    3px 3px 0 ${themeColor},
                                    -3px -3px 0 ${themeColor},
                                    3px -3px 0 ${themeColor},
                                    -3px 3px 0 ${themeColor},
                                    0px 6px 0px rgba(0,0,0,0.8)
                                `,
                                            WebkitTextStroke: `2px ${themeColor}`,
                                            textWrap: "balance" // Better distribution across multiple lines
                                        }}
                                    >
                                        {title}
                                    </h2>

                                    {/* Decorative Line */}
                                    <div
                                        className="w-1/3 h-1 md:h-2 mt-6 md:mt-8 rounded-full opacity-80"
                                        style={{ background: `linear-gradient(to right, transparent, ${themeColor}, transparent)` }}
                                    ></div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 p-10">
                                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <p className="text-lg">Tải lên video và chọn một khung hình để bắt đầu.</p>
                            </div>
                        )}
                    </div>
                    <p className="text-sm text-center text-gray-500 mt-4 leading-relaxed">
                        * Cần chọn một khung làm nền mới có thể tải xuống. <br /> Hình ảnh được xuất ra dưới dạng chất lượng cao (High DPI) thích hợp cho Youtube.
                    </p>
                </div>

                {/* Right Column: Text & Adjustments */}
                <div className="xl:col-span-3 space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800 shadow-xl backdrop-blur-sm">
                    <div className="space-y-4">
                        <div className="text-sm font-medium text-gray-400 mb-2">2. Nội Dung & Màu Sắc</div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                <Music className="w-4 h-4 text-pink-400" /> Tên bài hát
                            </label>
                            <input
                                type="text"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-pink-500 transition-colors font-bold text-lg"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Nhập tên bài hát..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                <Youtube className="w-4 h-4 text-red-500" /> Tên kênh
                            </label>
                            <input
                                type="text"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                                value={channelName}
                                onChange={(e) => setChannelName(e.target.value)}
                                placeholder="Nhập tên kênh..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Thông tin bổ sung (Tone, Thể loại...)</label>
                            <input
                                type="text"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                                value={extraInfo}
                                onChange={(e) => setExtraInfo(e.target.value)}
                                placeholder="KARAOKE BEAT GỐC"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                <Palette className="w-4 h-4 text-blue-400" /> Màu chủ đạo
                            </label>
                            <input
                                type="color"
                                className="w-12 h-12 bg-transparent border-0 cursor-pointer rounded overflow-hidden p-0 block"
                                value={themeColor}
                                onChange={(e) => setThemeColor(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-gray-800">
                        <div className="text-sm font-medium text-gray-400 mb-2">3. Điều Chỉnh Nền</div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center justify-between">
                                <span className="flex items-center gap-2"><ZoomIn className="w-4 h-4 text-green-400" /> Phóng to (Zoom)</span>
                                <span className="text-white font-bold">{bgScale}x</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="3"
                                step="0.05"
                                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                                value={bgScale}
                                onChange={(e) => setBgScale(parseFloat(e.target.value))}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center justify-between">
                                <span className="flex items-center gap-2"><MoveHorizontal className="w-4 h-4 text-orange-400" /> Ngang (X)</span>
                                <span className="text-white font-bold">{bgPosX}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                value={bgPosX}
                                onChange={(e) => setBgPosX(parseFloat(e.target.value))}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center justify-between">
                                <span className="flex items-center gap-2"><MoveVertical className="w-4 h-4 text-purple-400" /> Dọc (Y)</span>
                                <span className="text-white font-bold">{bgPosY}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                value={bgPosY}
                                onChange={(e) => setBgPosY(parseFloat(e.target.value))}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
