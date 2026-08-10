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

// Clean up ASS-specific linebreaks and spaces
function cleanAssText(text: string): string {
    return text
        .replace(/\\N/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\h/g, ' ');
}

// Parse karaoke segments from raw dialogue text using bracket-splitting
function parseKaraokeSegments(rawText: string, startMs: number): KaraokeCaption['segments'] {
    const parts = rawText.split(/([{}])/);
    const segments: NonNullable<KaraokeCaption['segments']> = [];
    
    let inBraces = false;
    let lastKTag: { type: 'k' | 'kf'; durationMs: number } | null = null;
    let accumulatedText = '';
    let offsetMs = 0;

    const commitSegment = () => {
        if (lastKTag !== null || accumulatedText !== '') {
            const duration = lastKTag ? lastKTag.durationMs : 0;
            segments.push({
                text: cleanAssText(accumulatedText),
                startMs: startMs + offsetMs,
                endMs: startMs + offsetMs + duration,
                type: lastKTag ? lastKTag.type : 'k',
            });
            offsetMs += duration;
            accumulatedText = '';
            lastKTag = null;
        }
    };

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === '{') {
            inBraces = true;
        } else if (part === '}') {
            inBraces = false;
        } else if (inBraces) {
            // Find karaoke tags inside override blocks: \k, \K, \kf, \ko
            const kMatch = part.match(/\\(k[ofK]?)(\d+)/i);
            if (kMatch) {
                // Since we found a new karaoke tag, commit the previous syllable segment
                commitSegment();
                
                const typeStr = kMatch[1].toLowerCase();
                const durCs = Number(kMatch[2]) || 0;
                
                // \kf, \ko, and uppercase \K are smooth fills
                const isSmooth = typeStr === 'kf' || typeStr === 'ko' || kMatch[1] === 'K';
                
                lastKTag = {
                    type: isSmooth ? 'kf' : 'k',
                    durationMs: durCs * 10,
                };
            }
            // If it's a non-karaoke tag block, we do NOT commit anything and just continue.
        } else {
            // Accumulate dialogue text
            accumulatedText += part;
        }
    }
    
    // Commit the final segment
    commitSegment();

    return segments.length > 0 ? segments : undefined;
}

// Parse ASS (Advanced SubStation Alpha) đơn giản thành caption
function parseAssTime(t: string): number {
    // Định dạng: H:MM:SS.cs (centiseconds) - hỗ trợ cả dấu chấm và dấu phẩy
    const match = t.trim().match(/(\d+):(\d{2}):(\d{2})[.,](\d{2})/);
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
        
        // Split on the first 9 commas to safely handle commas inside the Text field
        const parts: string[] = [];
        let temp = withoutPrefix;
        for (let i = 0; i < 9; i++) {
            const commaIdx = temp.indexOf(',');
            if (commaIdx === -1) break;
            parts.push(temp.substring(0, commaIdx));
            temp = temp.substring(commaIdx + 1);
        }
        parts.push(temp);

        if (parts.length < 10) continue;

        const startStr = parts[1];
        const endStr = parts[2];
        const rawText = parts[9];

        const startMs = parseAssTime(startStr);
        const endMs = parseAssTime(endStr);

        // Parse segments if there are any karaoke tags in the line
        let segments: KaraokeCaption['segments'] | undefined;
        if (/\\k[ofK]?\d+/i.test(rawText)) {
            segments = parseKaraokeSegments(rawText, startMs);
        }

        // Display text: strip override tags and clean up
        let plainText = '';
        if (segments && segments.length > 0) {
            plainText = segments.map((s) => s.text).join('');
        } else {
            plainText = cleanAssText(rawText.replace(/\{[^}]*}/g, ''));
        }
        
        plainText = plainText.trim();
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
