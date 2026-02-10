/* eslint-disable no-undef */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Các thư mục cần dọn dẹp để giảm tải máy khi dùng editor / render
const PATHS_TO_CLEAN = [
  '../public/uploads',          // File người dùng upload (audio, video, background)
  '../public/out',              // File MP4 đã render
  '../.remotion',               // Cache Remotion (nếu có)
  '../node_modules/.cache/remotion', // Cache Remotion trong node_modules (nếu có)
];

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const cleanDir = (relativePath) => {
  const dir = path.join(__dirname, relativePath);

  if (!fs.existsSync(dir)) {
    // Với uploads/out, nếu chưa có thì tạo để tránh lỗi các chỗ khác
    if (relativePath === '../public/uploads' || relativePath === '../public/out') {
      console.log(`[cleanup] ${dir} không tồn tại, tạo mới...`);
      ensureDir(dir);
    }
    return;
  }

  console.log(`[cleanup] Dọn dẹp ${dir}...`);
  try {
    // Xoá toàn bộ nội dung bên trong nhưng giữ lại thư mục gốc
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      } catch (err) {
        console.warn(`[cleanup] Không xoá được ${fullPath}:`, err.message ?? err);
      }
    }
  } catch (err) {
    console.warn(`[cleanup] Lỗi khi đọc thư mục ${dir}:`, err.message ?? err);
  }
};

for (const p of PATHS_TO_CLEAN) {
  cleanDir(p);
}

console.log('[cleanup] Hoàn tất.');
