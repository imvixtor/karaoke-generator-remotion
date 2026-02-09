import { NextRequest, NextResponse } from "next/server";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
// We import the bundle to find compositions.
// In a real app, you might want to bundle separately or point to the entry file.
// For simplicity in Next.js + Remotion monorepo, we can point to the entry point.
import { bundle } from "@remotion/bundler";

export async function POST(request: NextRequest) {
    try {
        const inputProps = await request.json();
        const compositionId = "KaraokeVideo";
        const entryPoint = join(process.cwd(), "src/remotion/index.ts"); // Check if index.ts exists, it might be Root.tsx or different.

        // Create output directory
        const outputDir = join(process.cwd(), "public/out");
        const fs = await import("fs");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filename = `karaoke-${uuidv4()}.mp4`;
        const finalOutput = join(outputDir, filename);

        console.log("Bundling...");
        const bundleLocation = await bundle({
            entryPoint,
            // If you have specific webpack config, you might need it here but default usually works
        });

        console.log("Selecting composition...");
        const composition = await selectComposition({
            serveUrl: bundleLocation,
            id: compositionId,
            inputProps,
        });

        console.log("Rendering...");
        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: "h264",
            outputLocation: finalOutput,
            inputProps,
        });

        return NextResponse.json({ success: true, filename: `/out/${filename}` });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
