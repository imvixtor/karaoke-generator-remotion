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

export async function POST(request: NextRequest) {
    const renderId = uuidv4();
    const body = await request.json();
    let inputProps: any;
    let options: { crf?: number; renderSample?: boolean } = {};

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

            await renderFrames({
                composition,
                serveUrl: bundleLocation,
                inputProps: step1InputProps,
                imageFormat: 'png',
                outputDir: foregroundDir,
                chromiumOptions: {
                    gl: autoDetectedGl,
                },
                frameRange: options.renderSample ? [0, Math.min(30 * 30, durationInFrames) - 1] : undefined,
                cancelSignal,
                onStart: () => {
                    console.log(`[${renderId}] Render started`);
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
            console.log(`[${renderId}] Step 1 Complete. Renaming files...`);

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

                // Rename
                for (let i = 0; i < files.length; i++) {
                    const oldPath = join(foregroundDir, files[i]);
                    const newPath = join(foregroundDir, `fg_${String(i).padStart(4, '0')}.png`);
                    if (oldPath !== newPath) {
                        fs.renameSync(oldPath, newPath);
                    }
                }
            } catch (e) {
                console.error("Renaming error:", e);
                // Continue? If renaming fails, ffmpeg might fail.
                throw e;
            }

            if (isCancelled) throw new Error("Cancelled");
            console.log(`[${renderId}] Step 1 Complete. Starting Step 2...`);

            // --- STEP 2: COMPOSE (FFmpeg) ---
            renderProgress[renderId] = { progress: 70, status: "compositing" };

            // Prepare inputs
            const bgSrc = inputProps.backgroundSrc;
            const bgType = inputProps.backgroundType; // 'video' | 'image' | 'black'
            const audioSrc = inputProps.audioSrc;
            const bgDim = inputProps.backgroundDim ?? 0;

            const videoLoop = inputProps.videoLoop ?? false;
            const videoStartTime = inputProps.backgroundVideoStartTime ?? 0;

            // Construct FFmpeg command
            // Inputs:
            // 0: Background (if exists) - or generic black
            // 1: Audio
            // 2: Foreground Sequence

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
            // Remotion uses 0-indexed frames usually? outputLocation was "fg_{frame}.png"
            // With "frame_{frame}.png" Remotion replaces {frame} with the numbers.
            // We need to know the start number. Usually 0.
            // Files are renamed to fg_0000.png, so use %04d.
            inputs.push(`-framerate ${fps} -i "${join(foregroundDir, 'fg_%04d.png')}"`);
            fgIndex = streamIndex++;

            // Filter Chain Construction
            // Goal: [bg] -> scale/crop -> loop/trim -> blur -> dim -> [final_bg]
            // [final_bg][fg] overlay -> output

            let currentBgLabel = "";

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
                // Remotion dim is overlay black with opacity = 1 - backgroundDim?
                // Wait, backgroundDim in Remotion: "opacity: shouldShowDimOverlay ? 0.8 : 1 - backgroundDim" in the overlay div.
                // The overlay div is black.
                // So we want to overlay black with alpha.
                // Or simply darken the video.
                // "1 - backgroundDim" opacity implies:
                // If dim=1, opacity=0 (transparent black -> no dim).
                // If dim=0.6, opacity=0.4.
                // Users prop: "backgroundDim: 0.60" -> User likely means "Darkness level".
                // In code: `opacity: 1 - backgroundDim`.
                // If user sets 0.60. Opacity = 0.4.
                // This means the black layer has 0.4 opacity.
                // Result = BG * 0.6 + Black * 0.4.
                // FFmpeg: color=black@0.4 ... or drawbox.
                // Actually `eq` filter: brightness.
                // Or overlay a black color source.

                // Let's use `color` source overlay.
                // But simpler: just use `drawbox=color=black@<opacity>:t=fill`.
                // Opacity in remotion logic: `1 - backgroundDim`.
                // Example: dim=0.6 -> opacity=0.4.
                // Wait, `KaraokeComposition` logic:
                // `opacity: shouldShowDimOverlay ? 0.8 : 1 - backgroundDim`
                // If dim=0.6, opacity=0.4. A black layer with 0.4 opacity.
                // This obscures the video.
                // If dim=1 (100% bright?), opacity=0.
                // If dim=0 (dark?), opacity=1.
                // Seems `backgroundDim` implies "Brightness" in current code logic?
                // `opacity: 1 - backgroundDim`.
                // If Dim=1 => Opacity 0 => Fully visible BG.
                // If Dim=0 => Opacity 1 => Fully Black.
                // So `backgroundDim` is effectively "Brightness".

                // Let's call it brightnessFactor = backgroundDim.
                // We can use default if undefined (0.6).
                const brightness = bgDim;
                if (brightness < 1) {
                    const opacity = 1 - brightness;
                    // overlay black with alpha = opacity.
                    // drawbox is easiest to not need extra input.
                    filterComplex.push(`[${lastLabel}]drawbox=color=black@${opacity}:t=fill[bg_dimmed]`);
                    lastLabel = "bg_dimmed";
                }

                // 4. Trim to duration (important for loop matching)
                // We want the BG to last exactly durationInFrames
                // The `-t` option on output handles total duration, but for filter matching...
                // We rely on -t in output.

                currentBgLabel = lastLabel;
            } else {
                // Create black background
                filterComplex.push(`color=black:s=${width}x${height}:d=${durationSec}[bg_black]`);
                currentBgLabel = "bg_black";
            }

            // Overlay Foreground
            // [bg][fg]overlay
            filterComplex.push(`[${currentBgLabel}][${fgIndex}:v]overlay=0:0:format=auto[v_final]`);

            // Audio mapping
            let mapAudio = "";
            if (audioIndex !== -1) {
                mapAudio = `-map ${audioIndex}:a`;
            }

            // Assemble Command
            // Use -y to overwrite
            // -t durationSec to limit output
            // -pix_fmt yuv420p for compatibility

            const filterStr = filterComplex.join(";");
            const cmd = `ffmpeg -hwaccel cuda ${inputs.join(" ")} -filter_complex "${filterStr}" -map "[v_final]" ${mapAudio} -c:v h264_nvenc -crf ${options.crf ?? 23} -preset medium -c:a aac -b:a 192k -t ${durationSec} -y "${finalOutputPath}"`;

            console.log(`[${renderId}] Executing FFmpeg: ${cmd}`);

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
