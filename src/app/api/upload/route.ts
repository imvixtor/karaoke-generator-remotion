import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;

    if (!file) {
        return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);

    const id = uuidv4();
    const filename = `${id}-${file.name.replace(/\s+/g, "_")}`;
    const uploadDir = join(process.cwd(), "public/uploads");
    const filePath = join(uploadDir, filename);

    // Ensure directory exists (async check/create is tricky in edge runtime but this is node)
    // For simplicity, assume public/uploads exists or use fs.mkdir
    const fs = await import("fs");
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    await writeFile(filePath, buffer);
    const url = `/uploads/${filename}`;

    return NextResponse.json({ success: true, url });
}
