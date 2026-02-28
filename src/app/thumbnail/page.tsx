import { Metadata } from "next";
import { ThumbnailGenerator } from "../../components/ThumbnailGenerator";

export const metadata: Metadata = {
    title: "Tạo Thumbnail - Karaoke Generator",
    description: "Trình tạo thumbnail chất lượng cao chuyên nghiệp cho video karaoke",
};

export default function ThumbnailPage() {
    return (
        <main className="min-h-screen bg-gray-950 text-white font-sans">
            <ThumbnailGenerator />
        </main>
    );
}
