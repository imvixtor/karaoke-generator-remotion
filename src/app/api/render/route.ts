import { NextRequest, NextResponse } from "next/server";
import { renderMedia, selectComposition } from "@remotion/renderer";
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
    let inputProps;
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
        try {
            const compositionId = "KaraokeVideo";
            const entryPoint = join(process.cwd(), "src/remotion/index.ts");

            // Create output directory
            const outputDir = join(process.cwd(), "public/out");
            const fs = await import("fs");
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const filename = `karaoke-${renderId}.mp4`;
            const finalOutput = join(outputDir, filename);

            if (isCancelled) throw new Error("Cancelled");
            renderProgress[renderId] = { progress: 1, status: "bundling" };
            console.log("Bundling...");

            // Check cancellation before heavy operations
            if (isCancelled) throw new Error("Cancelled");

            const bundleLocation = await bundle({
                entryPoint,
            });

            if (isCancelled) throw new Error("Cancelled");
            renderProgress[renderId] = { progress: 5, status: "selecting" };
            console.log("Selecting composition...");
            const composition = await selectComposition({
                serveUrl: bundleLocation,
                id: compositionId,
                inputProps,
            });

            if (isCancelled) throw new Error("Cancelled");
            renderProgress[renderId] = { progress: 10, status: "rendering" };
            console.log("Rendering...");

            // Auto-detect OS để chọn đúng GPU backend cho Chromium
            // Windows: "angle", Linux: "egl" hoặc "swangle", macOS: "swangle" hoặc undefined
            const getGlOption = () => {
                const platform = process.platform;
                if (platform === 'win32') {
                    return 'angle'; // Windows GPU acceleration
                } else if (platform === 'linux') {
                    return 'egl'; // Linux GPU acceleration (hoặc 'swangle' nếu không có GPU)
                } else if (platform === 'darwin') {
                    return 'swangle'; // macOS (hoặc undefined để dùng default)
                }
                return undefined; // Fallback: không set, để Remotion tự chọn
            };

            await renderMedia({
                composition,
                serveUrl: bundleLocation,
                codec: "h264",
                outputLocation: finalOutput,
                inputProps,
                chromiumOptions: {
                    gl: getGlOption(), // Cross-platform GPU acceleration
                },
                crf: options.crf ?? 25,
                frameRange: options.renderSample ? [0, Math.min(30 * 30, composition.durationInFrames) - 1] : undefined,
                cancelSignal,
                onProgress: ({ progress }) => {
                    if (isCancelled) return;
                    // progress is 0-1
                    const pct = Math.round(10 + progress * 85);
                    renderProgress[renderId] = { progress: pct, status: "rendering" };
                },
            });

            if (!isCancelled) {
                renderProgress[renderId] = { progress: 100, status: "done", filename: `/out/${filename}` };
            }
        } catch (err) {
            console.error(err);
            if (String(err).includes("Aborted") || String(err).includes("Cancelled") || String(err).includes("user cancelled")) {
                renderProgress[renderId] = { progress: 0, status: "cancelled" };
            } else {
                renderProgress[renderId] = { progress: 0, status: "error", error: String(err) };
            }
        } finally {
            delete renderCancels[renderId];
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
