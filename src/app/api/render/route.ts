import { NextRequest, NextResponse } from "next/server";
import { selectComposition, renderFrames } from "@remotion/renderer";
import { makeCancelSignal } from "@remotion/renderer";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { bundle } from "@remotion/bundler";

// Store render progress in memory (for progress polling)
const renderProgress: Record<string, { progress: number; status: string; filename?: string; error?: string }> = {};

// Store cancel functions for cancellation
const renderCancels: Record<string, () => void> = {};

import { KaraokeCompositionProps } from "../../../types/karaoke";
import os from "os";

// Cache for encoder detection
let cachedEncoder: "h264_nvenc" | "libx264" | null = null;

async function getAvailableEncoder(): Promise<"h264_nvenc" | "libx264"> {
    if (cachedEncoder !== null) return cachedEncoder;
    try {
        const cp = await import("child_process");
        const util = await import("util");
        const execAsync = util.promisify(cp.exec);
        const { stdout } = await execAsync("ffmpeg -encoders");
        if (stdout.includes("h264_nvenc")) {
            cachedEncoder = "h264_nvenc";
        } else {
            cachedEncoder = "libx264";
        }
    } catch (e) {
        cachedEncoder = "libx264";
    }
    return cachedEncoder;
}

export async function POST(request: NextRequest) {
    const renderId = uuidv4();
    const body = await request.json();
    let inputProps: KaraokeCompositionProps;
    let options: { renderSample?: boolean } = {};

    // Check if the body has inputProps and options structure or just inputProps (legacy)
    if (body.inputProps) {
        inputProps = body.inputProps;
        options = body.options || {};
    } else {
        inputProps = body;
    }

    // Initialize progress immediately
    renderProgress[renderId] = { progress: 0, status: "init" };

    // Create CancelSignal from Remotion
    const { cancel, cancelSignal } = makeCancelSignal();
    renderCancels[renderId] = cancel;

    // Track cancellation state locally
    let isCancelled = false;
    const cancelWrapper = () => {
        isCancelled = true;
        cancel();
    };
    renderCancels[renderId] = cancelWrapper;

    // Run rendering in background (do not await)
    (async () => {
        const fs = await import("fs");
        const cp = await import("child_process");
        const util = await import("util");
        const exec = util.promisify(cp.exec);
        const rimraf = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });

        // Paths
        // Use a persistent temp dir or public dir?
        // Step 1 output: public/renders/foreground/{renderId}/fg_%04d.png
        // Final output: public/out/karaoke-{renderId}.mp4
        const projectRoot = process.cwd();
        const outputDir = join(projectRoot, "public/out");
        const foregroundDir = join(projectRoot, "public/renders/foreground", renderId);

        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        if (!fs.existsSync(foregroundDir)) fs.mkdirSync(foregroundDir, { recursive: true });

        const finalFilename = `karaoke-${renderId}.mp4`;
        const finalOutputPath = join(outputDir, finalFilename);

        // Define cleanup function
        const cleanup = () => {
            try {
                // Delete foreground sequence to save space
                rimraf(foregroundDir);
                // Also remove the folder itself if empty
                // fs.rmdirSync(join(projectRoot, "public/renders/foreground"), { recursive: false }); // Optional
            } catch (e) {
                console.error("Cleanup error:", e);
            }
            delete renderCancels[renderId];
        };

        try {
            const compositionId = "KaraokeVideo";
            const entryPoint = join(process.cwd(), "src/remotion/index.ts");

            if (isCancelled) throw new Error("Cancelled");
            renderProgress[renderId] = { progress: 1, status: "bundling" };
            console.log(`[${renderId}] Bundling...`);

            const bundleLocation = await bundle({
                entryPoint,
            });

            if (isCancelled) throw new Error("Cancelled");
            renderProgress[renderId] = { progress: 5, status: "selecting" };
            console.log(`[${renderId}] Selecting composition...`);

            // Force renderForegroundOnly = true in inputProps
            const step1InputProps = { ...inputProps, renderForegroundOnly: true };

            // Calculate metadata to get duration/fps
            // Pass step1InputProps to selectComposition to ensure calculateMetadata sees the override
            const composition = await selectComposition({
                serveUrl: bundleLocation,
                id: compositionId,
                inputProps: step1InputProps,
            });

            const { fps, durationInFrames, width, height } = composition;

            // --- STEP 1: RENDER FOREGROUND (Remotion) ---
            const hasCaptions = inputProps.captions && inputProps.captions.length > 0;

            if (hasCaptions) {
                if (isCancelled) throw new Error("Cancelled");
                renderProgress[renderId] = { progress: 10, status: "rendering_fg" };
                console.log(`[${renderId}] Step 1: Rendering Foreground...`);

                const autoDetectedGl = (() => {
                    const platform = process.platform;
                    if (platform === 'win32') return 'angle';
                    if (platform === 'linux') return 'egl';
                    if (platform === 'darwin') return 'swangle';
                    return undefined;
                })();

                const cpuCount = os.cpus().length;
                const concurrency = Math.max(1, Math.floor(cpuCount / 2));

                await renderFrames({
                    composition,
                    serveUrl: bundleLocation,
                    inputProps: step1InputProps,
                    imageFormat: 'png',
                    outputDir: foregroundDir,
                    concurrency,
                    chromiumOptions: {
                        gl: autoDetectedGl,
                    },
                    frameRange: options.renderSample ? [0, Math.min(30 * 30, durationInFrames) - 1] : undefined,
                    cancelSignal,
                    onStart: () => {
                        console.log(`[${renderId}] Render started with concurrency ${concurrency}`);
                    },
                    onFrameUpdate: (rendered) => {
                        if (isCancelled) return;
                        // Step 1 accounts for 0-70% of total progress
                        const totalFrames = options.renderSample ? Math.min(30 * 30, durationInFrames) : durationInFrames;
                        const progress = rendered / totalFrames;
                        const pct = Math.round(10 + progress * 60);
                        renderProgress[renderId] = { progress: pct, status: "rendering_fg" };
                    }
                });

                if (isCancelled) throw new Error("Cancelled");
                console.log(`[${renderId}] Step 1 Complete. Renaming files in parallel...`);

                // Normalize filenames to fg_%04d.png for FFmpeg
                try {
                    const files = fs.readdirSync(foregroundDir)
                        .filter((f: string) => f.endsWith('.png'));

                    // Sort by frame number extracted from filename
                    files.sort((a: string, b: string) => {
                        const numA = parseInt(a.match(/(\d+)\.png$/)?.[1] || "0");
                        const numB = parseInt(b.match(/(\d+)\.png$/)?.[1] || "0");
                        return numA - numB;
                    });

                    // Rename in parallel using fs.promises
                    const renamePromises = files.map((file, i) => {
                        const oldPath = join(foregroundDir, file);
                        const newPath = join(foregroundDir, `fg_${String(i).padStart(4, '0')}.png`);
                        if (oldPath !== newPath) {
                            return fs.promises.rename(oldPath, newPath);
                        }
                        return Promise.resolve();
                    });
                    await Promise.all(renamePromises);
                } catch (e) {
                    console.error("Renaming error:", e);
                    // Continue? If renaming fails, ffmpeg might fail.
                    throw e;
                }
            } else {
                console.log(`[${renderId}] No captions provided. Skipping Step 1 (Foreground Render).`);
            }

            if (isCancelled) throw new Error("Cancelled");
            console.log(`[${renderId}] Starting Step 2...`);

            // --- STEP 2: COMPOSE (FFmpeg) ---
            renderProgress[renderId] = { progress: 70, status: "compositing" };

            // Prepare inputs
            const bgSrc = inputProps.backgroundSrc;
            const bgType = inputProps.backgroundType; // 'video' | 'image' | 'black'
            const audioSrc = inputProps.audioSrc;
            const bgDim = inputProps.backgroundDim ?? 0.5;

            const videoLoop = inputProps.videoLoop ?? false;
            const videoStartTime = inputProps.backgroundVideoStartTime ?? 0;

            // Construct FFmpeg command
            // Inputs:
            // 0: Background (if exists) - or generic black
            // 1: Audio
            // 2: Foreground Sequence (only if hasCaptions)

            // Note: If no background src (type=black), we can generate black color source.

            const inputs: string[] = [];
            const filterComplex: string[] = [];
            let streamIndex = 0;
            let audioIndex = -1;
            let fgIndex = -1;
            let bgIndex = -1;

            // Handle audio input
            if (audioSrc) {
                inputs.push(`-i "${audioSrc}"`);
                audioIndex = streamIndex++;
            }

            // Handle background input
            if (bgType === 'image' && bgSrc) {
                // Loop image
                inputs.push(`-loop 1 -i "${bgSrc}"`);
                bgIndex = streamIndex++;
            } else if (bgType === 'video' && bgSrc) {
                // Video input
                // Check if loop needed. FFmpeg -stream_loop -1 must be before -i
                // Also apply start time if provided (trimming)
                // -ss before -i seeks input.
                const ss = videoStartTime > 0 ? `-ss ${videoStartTime}` : "";

                if (videoLoop) {
                    // -stream_loop -1 loops the input.
                    // If we use -ss before -i, it seeks first.
                    // Combined: -ss ... -stream_loop -1 -i ...
                    inputs.push(`${ss} -stream_loop -1 -i "${bgSrc}"`);
                } else {
                    inputs.push(`${ss} -i "${bgSrc}"`);
                }
                bgIndex = streamIndex++;
            } else {
                // Black background generator (virtual)
                // We'll use color filter source
            }

            // Foreground input (ensure frame pattern matches remotion output)
            if (hasCaptions) {
                inputs.push(`-framerate ${fps} -i "${join(foregroundDir, 'fg_%04d.png')}"`);
                fgIndex = streamIndex++;
            }

            // Filter Chain Construction
            // Goal: [bg] -> scale/crop -> loop/trim -> blur -> dim -> [final_bg]
            // [final_bg][fg] overlay -> output (if hasCaptions)
            // [final_bg] -> output (if !hasCaptions)

            let currentBgLabel = "";
            let finalOutputLabel = "";

            // Calculate actual duration in seconds based on what we rendered (Step 1)
            // If renderSample is true, we only rendered 30s.
            const frameCountToRender = options.renderSample ? Math.min(30 * 30, durationInFrames) : durationInFrames;
            const durationSec = frameCountToRender / fps;

            if (bgIndex !== -1) {
                let lastLabel = `${bgIndex}:v`;

                // 1. Scale to fit/fill 1920x1080 (assuming 16:9 output)
                // Force scale to 1920x1080 to match Foreground
                filterComplex.push(`[${lastLabel}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(iw-${width})/2:(ih-${height})/2[bg_scaled]`);
                lastLabel = "bg_scaled";

                // 3. Dim
                const brightness = bgDim;
                if (brightness < 1) {
                    const opacity = 1 - brightness;
                    // overlay black with alpha = opacity.
                    // drawbox is easiest to not need extra input.
                    filterComplex.push(`[${lastLabel}]drawbox=color=black@${opacity}:t=fill[bg_dimmed]`);
                    lastLabel = "bg_dimmed";
                }

                currentBgLabel = lastLabel;
            } else {
                // Create black background
                filterComplex.push(`color=black:s=${width}x${height}:d=${durationSec}[bg_black]`);
                currentBgLabel = "bg_black";
            }

            // Overlay Foreground (if exists)
            if (hasCaptions && fgIndex !== -1) {
                filterComplex.push(`[${currentBgLabel}][${fgIndex}:v]overlay=0:0:format=auto[v_final]`);
                finalOutputLabel = "[v_final]";
            } else {
                // Just use the background
                finalOutputLabel = `[${currentBgLabel}]`;
            }

            // Audio mapping
            let mapAudio = "";
            if (audioIndex !== -1) {
                mapAudio = `-map ${audioIndex}:a`;
            }

            // Dynamic encoder and optimized params
            const encoder = await getAvailableEncoder();
            const isNvidia = encoder === "h264_nvenc";

            const hwaccelFlag = isNvidia ? "-hwaccel cuda" : "";
            
            // Video codec & quality optimization:
            // 1. Nvidia GPU:
            //    - Use `-preset p4` for wide compatibility.
            //    - Use VBR Constant Quality `-cq 26` with targeted average `-b:v 1.8M` & `-maxrate:v 3.5M`.
            //      This keeps the background clear while reducing the 3.5min video size to ~45-65MB.
            //    - Spatial-aq / Temporal-aq remain enabled to keep text edges crisp.
            // 2. CPU Fallback (libx264):
            //    - Use `-crf 23` (FFmpeg default, excellent quality/size balance) to keep the video sharp.
            //    - Set `-preset medium` for a great balance between compression speed and quality.
            const videoCodecParams = isNvidia
                ? "-c:v h264_nvenc -preset p4 -rc vbr -cq 26 -b:v 1.8M -maxrate:v 3.5M -bufsize 7M -spatial-aq 1 -temporal-aq 1 -rc-lookahead 20 -profile:v high -pix_fmt yuv420p"
                : "-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p";

            const filterStr = filterComplex.join(";");
            
            // Assemble Command
            // Use -y to overwrite
            // -t durationSec to limit output
            // Forced output framerate to 30fps as requested: `-r 30`.
            const cmd = `ffmpeg ${hwaccelFlag} ${inputs.join(" ")} -filter_complex "${filterStr}" -map "${finalOutputLabel}" ${mapAudio} ${videoCodecParams} -c:a aac -b:a 192k -r 30 -t ${durationSec} -y "${finalOutputPath}"`;

            console.log(`[${renderId}] Executing FFmpeg (${encoder}): ${cmd}`);

            // Execute
            await exec(cmd);
            // console.log(stdout); // FFmpeg logs to stderr usually

            if (!fs.existsSync(finalOutputPath)) throw new Error("FFmpeg failed to create output file");

            if (!isCancelled) {
                renderProgress[renderId] = { progress: 100, status: "done", filename: `/out/${finalFilename}` };
            }
        } catch (err) {
            console.error(err);
            if (String(err).includes("Aborted") || String(err).includes("Cancelled") || String(err).includes("user cancelled")) {
                renderProgress[renderId] = { progress: 0, status: "cancelled" };
            } else {
                renderProgress[renderId] = { progress: 0, status: "error", error: String(err) };
            }
        } finally {
            cleanup();
        }
    })();

    return NextResponse.json({ success: true, renderId });
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const renderId = searchParams.get("id");

    if (!renderId) {
        return NextResponse.json({ error: "No render ID provided" }, { status: 400 });
    }

    if (renderCancels[renderId]) {
        renderCancels[renderId](); // Call the cancel function
        delete renderCancels[renderId];
        renderProgress[renderId] = { progress: 0, status: "cancelled" };
        return NextResponse.json({ success: true, message: "Render cancelled" });
    }

    return NextResponse.json({ error: "Render not found or already finished" }, { status: 404 });
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const renderId = searchParams.get("id");
    if (!renderId || !renderProgress[renderId]) {
        return NextResponse.json({ error: "Render ID not found" }, { status: 404 });
    }
    return NextResponse.json(renderProgress[renderId]);
}
