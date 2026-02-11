const fs = require('fs');
const path = 'src/app/editor/page.tsx';

try {
    const content = fs.readFileSync(path, 'utf-8');
    const lines = content.split('\n');

    // We want to replace lines from index 919 (line 920) to index 1017 (line 1018).
    // Let's verify start line content
    if (!lines[919].includes('<div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">')) {
        console.error('Line 920 does not match expected start of block.');
        console.error('Actual:', lines[919]);
        process.exit(1);
    }

    // Let's verify end line index roughly.
    // The block is roughly 100 lines long.
    // Let's just use the range 919 to 1017 based on my previous analysis.

    const newPart = fs.readFileSync('src/app/editor/timeline_ui_part.tsx', 'utf-8');

    // Remove 99 lines starting at 919
    // Wait, 1018 - 920 + 1 = 99 lines.
    // Indices: 919 ... 1017. Total 99 lines.

    lines.splice(919, 99, newPart);

    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully replaced content.');

} catch (e) {
    console.error(e);
    process.exit(1);
}
