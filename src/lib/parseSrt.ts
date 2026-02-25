import type { KaraokeCaption } from '../types/karaoke';

/** Parse SRT/ASS thành mảng KaraokeCaption */
export type ParsedCaption = KaraokeCaption;

function parseSrtTime(s: string): number {
    const match = s.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) return 0;
    const [, h, m, sec, ms] = match.map(Number);
    return (h * 3600 + m * 60 + sec) * 1000 + ms;
}

export function parseSrtContent(input: string): ParsedCaption[] {
    const blocks = input.trim().split(/\n\s*\n/).filter(Boolean);
    const captions: ParsedCaption[] = [];

    for (const block of blocks) {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;

        const timeMatch = lines[1].match(/^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
        if (!timeMatch) continue;

        const startMs = parseSrtTime(timeMatch[1]);
        const endMs = parseSrtTime(timeMatch[2]);
        const text = lines.slice(2).join(' ');

        captions.push({
            text,
            startMs,
            endMs,
            timestampMs: (startMs + endMs) / 2,
            confidence: 1,
        });
    }

    return captions;
}

// Parse ASS (Advanced SubStation Alpha) đơn giản thành caption
function parseAssTime(t: string): number {
    // Định dạng: H:MM:SS.cs (centiseconds)
    const match = t.trim().match(/(\d+):(\d{2}):(\d{2})[.](\d{2})/);
    if (!match) return 0;
    const [, h, m, s, cs] = match.map(Number);
    const totalMs = (h * 3600 + m * 60 + s) * 1000 + cs * 10;
    return totalMs;
}

export function parseAssContent(input: string): ParsedCaption[] {
    const lines = input.split('\n');
    const captions: ParsedCaption[] = [];
    let inEvents = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('[Events]')) {
            inEvents = true;
            continue;
        }
        if (!inEvents) continue;
        if (!line.startsWith('Dialogue:')) continue;

        // ASS format: Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
        const withoutPrefix = line.replace(/^Dialogue:\s*/i, '');
        const parts = withoutPrefix.split(',');
        if (parts.length < 10) continue;

        const startStr = parts[1];
        const endStr = parts[2];
        const textParts = parts.slice(9);
        const rawText = textParts.join(',');

        const startMs = parseAssTime(startStr);
        const endMs = parseAssTime(endStr);

        // Nếu có tag \k / \K / \kf, parse thành segments
        let segments: KaraokeCaption['segments'] | undefined;
        if (/\{\\k[ofK]?\d+}/i.test(rawText)) {
            segments = [];
            let offsetMs = 0;
            const regex = /\{\\k[ofK]?(\d+)}([^\\{]*)/gi;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(rawText)) !== null) {
                const durCs = Number(match[1]) || 0;
                const segText = match[2].replace(/\{\\.*?}/g, '');
                if (!segText) {
                    offsetMs += durCs * 10;
                    continue;
                }
                const segStart = startMs + offsetMs;
                const segEnd = segStart + durCs * 10;
                segments.push({
                    text: segText,
                    startMs: segStart,
                    endMs: segEnd,
                });
                offsetMs += durCs * 10;
            }
        }

        // Text hiển thị: bỏ override tags
        const plainText = rawText.replace(/\{\\.*?}/g, '').trim();
        if (!plainText) continue;

        captions.push({
            text: plainText,
            startMs,
            endMs,
            timestampMs: (startMs + endMs) / 2,
            confidence: 1,
            segments,
        });
    }

    return captions;
}
