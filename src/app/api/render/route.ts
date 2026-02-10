import { NextRequest, NextResponse } from "next/server";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { bundle } from "@remotion/bundler";

// Store render progress in memory (for progress polling)
const renderProgress: Record<string, { progress: number; status: string; filename?: string; error?: string }> = {};

export async function POST(request: NextRequest) {
    const renderId = uuidv4();
    const inputProps = await request.json();

    // Initialize progress immediately
    renderProgress[renderId] = { progress: 0, status: "init" };

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

            renderProgress[renderId] = { progress: 1, status: "bundling" };
            console.log("Bundling...");
            const bundleLocation = await bundle({
                entryPoint,
            });

            renderProgress[renderId] = { progress: 5, status: "selecting" };
            console.log("Selecting composition...");
            const composition = await selectComposition({
                serveUrl: bundleLocation,
                id: compositionId,
                inputProps,
            });

            renderProgress[renderId] = { progress: 10, status: "rendering" };
            console.log("Rendering...");
            await renderMedia({
                composition,
                serveUrl: bundleLocation,
                codec: "h264",
                outputLocation: finalOutput,
                inputProps,
                chromiumOptions: {
                    gl: "angle", // Enable GPU acceleration
                },
                hardwareAcceleration: "required",
                onProgress: ({ progress }) => {
                    // progress is 0-1
                    const pct = Math.round(10 + progress * 85);
                    renderProgress[renderId] = { progress: pct, status: "rendering" };
                },
            });

            renderProgress[renderId] = { progress: 100, status: "done", filename: `/out/${filename}` };
        } catch (err) {
            console.error(err);
            renderProgress[renderId] = { progress: 0, status: "error", error: String(err) };
        }
    })();

    return NextResponse.json({ success: true, renderId });
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const renderId = searchParams.get("id");
    if (!renderId || !renderProgress[renderId]) {
        return NextResponse.json({ error: "Render ID not found" }, { status: 404 });
    }
    return NextResponse.json(renderProgress[renderId]);
}
