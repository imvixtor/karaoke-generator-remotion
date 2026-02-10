# Karaoke Generator (Next.js + Remotion)

Ứng dụng web cho phép bạn:

- Upload **audio** (beat, nhạc nền).
- Upload / chọn **background** (ảnh hoặc video).
- Import / chỉnh sửa **phụ đề** (SRT/ASS) với hiệu ứng karaoke.
- Xem **preview ngay trong trình duyệt** bằng `@remotion/player`.
- Render ra **video MP4** bằng Remotion (Node API).

Dự án chạy được trên **Windows, macOS, Linux** (sau khi cài đúng môi trường).

---

## 1. Yêu cầu hệ thống

### Node & npm

- **Node.js**: khuyến nghị `>= 18` (tốt nhất `>= 20`).
- **npm**: đi kèm Node hoặc dùng `yarn` / `pnpm` nếu muốn.

Kiểm tra:

```bash
node --version
npm --version
```

### FFmpeg (bắt buộc để render video)

#### Windows

- Dùng **Chocolatey**:

```bash
choco install ffmpeg
```

Hoặc tải từ `https://ffmpeg.org/download.html` và thêm vào `PATH`.

#### macOS (Homebrew)

```bash
brew install ffmpeg
```

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

#### Linux (Fedora/RHEL)

```bash
sudo dnf install ffmpeg
```

Kiểm tra:

```bash
ffmpeg -version
```

### Trình duyệt / Chrome / Chromium

Remotion cần có **Chrome/Chromium** để render:

- Trên **Windows / macOS**: thường đã có Chrome, Remotion cũng có thể tự tải.
- Trên **Linux server/headless**:
  - Cài `chromium-browser` hoặc `google-chrome-stable`.
  - Nếu không có display, có thể cần thêm `xvfb` (xem phần Troubleshooting).

---

## 2. Cài đặt & chạy dự án

### Clone & cài dependencies

```bash
git clone <URL_REPO_CỦA_BẠN> new-remotion
cd new-remotion

npm install
```

> Mỗi lần `npm install` xong, bạn chỉ cần làm lại nếu có thay đổi `package.json`.

### Chạy dev server (Next.js + Editor)

```bash
npm run dev
```

- Mặc định chạy tại `http://localhost:3000`.
- Trang editor ở `/editor`.

Trước khi dev/build/start, script `predev`/`prebuild`/`prestart` sẽ tự chạy:

- `node scripts/cleanup-uploads.mjs`
  - Dọn `public/uploads` (file upload cũ)
  - Dọn `public/out` (output render)
  - Dọn `.remotion`, `node_modules/.cache/remotion` (cache Remotion nếu có)

---

## 3. Cách sử dụng Editor

Vào `http://localhost:3000/editor`:

### 3.1. Âm thanh

- Ô **Âm thanh**:
  - Bấm **Choose file** để chọn file audio (`.mp3`, `.wav`, ...).
  - File sẽ được upload lên `public/uploads/...`.
  - Tên file đang dùng luôn hiển thị bên dưới input (kể cả sau F5, nhờ cache).

### 3.2. Nền (Background)

- Chọn loại:
  - `Đen (mặc định)`
  - `Hình ảnh`
  - `Video`
- Nếu là `Hình ảnh` hoặc `Video`:
  - Upload file nền.
  - Điều chỉnh:
    - **Độ mờ nền** (dim)
    - **Độ blur**
    - **Thời điểm bắt đầu** nếu là video
    - Tuỳ chọn **Loop video**

### 3.3. Phụ đề & hiệu ứng karaoke

- Tab **Phụ đề**:
  - Chọn màu **Đã hát** / **Chưa hát**.
  - Chọn **Font**, **Cỡ chữ**, **Đổ bóng**.
  - Chọn bố cục:
    - `Truyền thống (Trái/Phải - Dưới)` (2 dòng trái/phải)
    - `Căn dưới (Giữa)` (2 dòng giữa dưới).
- Tab **Chỉnh sửa phụ đề**:
  - Import SRT/ASS.
  - Sửa thời gian start/end theo định dạng `mm:ss.ms`.
  - Sửa text từng dòng.
  - Thêm/Xoá dòng, kéo thả để đổi thứ tự.

> Tất cả cài đặt (audioUrl, backgroundUrl, captions, font, layout, ...) được **cache trong `sessionStorage`**.  
> Sau F5, dữ liệu và preview vẫn còn, chỉ riêng input file (do bảo mật trình duyệt) phải chọn lại nếu muốn đổi file; tên file cũ vẫn hiển thị để bạn biết đang dùng gì.

### 3.4. Playback & phím tắt

Trong vùng preview:

- **Space**: Play / Pause (khi con trỏ không đang nằm trong ô input).
- **F**: Fullscreen toggle.
- **M**: Mute / Unmute.
- Đồng hồ nhỏ trong header phụ đề luôn hiển thị **thời gian hiện tại** của preview (mm:ss.ms).

---

## 4. Render video

Render được thực hiện qua API `POST /api/render` dùng Node API của Remotion.

### Cách render từ UI

- Trong header editor có nút **Render Video**:
  - Kiểm tra:
    - Đã chọn audio.
    - Có ít nhất 1 dòng phụ đề.
    - Nếu nền là video, đã load xong duration.
  - Gửi `inputProps` hiện tại sang `/api/render`.
  - Backend:
    - Bundle Remotion (`src/remotion/index.ts`).
    - Chọn composition `KaraokeVideo`.
    - Gọi `renderMedia()` với:
      - `codec: "h264"`
      - `crf`: theo slider CRF trong UI (10 = nét, 40 = nhẹ).
      - `frameRange`: nếu bật “Render mẫu 30s đầu”.
    - Lưu file vào `public/out/karaoke-<id>.mp4`.

### Tiến trình render & huỷ

- Tiến trình render được lưu trong bộ nhớ (`renderProgress`).
- UI poll `/api/render?id=...` để:
  - Hiển thị % progress,
  - Lấy `filename` khi xong,
  - Hiển thị thời gian render.
- Nút **Hủy Render** gọi `DELETE /api/render?id=...` để huỷ job.

---

## 5. Scripts npm

Trong `package.json`:

```json
"scripts": {
  "predev": "node scripts/cleanup-uploads.mjs",
  "dev": "next dev",
  "prebuild": "node scripts/cleanup-uploads.mjs",
  "build": "next build",
  "prestart": "node scripts/cleanup-uploads.mjs",
  "start": "next start",
  "lint": "eslint .",
  "remotion": "remotion studio",
  "render": "remotion render",
  "deploy": "node deploy.mjs",
  "clean": "node scripts/cleanup-uploads.mjs"
}
```

### Các lệnh chính

- **Chạy dev**:

  ```bash
  npm run dev
  ```

- **Build production**:

  ```bash
  npm run build
  npm start
  ```

- **Mở Remotion Studio (độc lập)**:

  ```bash
  npm run remotion
  ```

- **Render Remotion CLI (thô)**:

  ```bash
  npm run render
  ```

- **Dọn sạch uploads, output, cache Remotion**:

  ```bash
  npm run clean
  ```

---

## 6. Cross-platform: Windows / macOS / Linux

Dự án đã được chỉnh để chạy tốt trên cả 3 hệ điều hành:

### Path & file system

- Sử dụng `path.join()` và `process.cwd()` cho mọi đường dẫn:
  - `public/uploads`
  - `public/out`
  - `.remotion`
- Scripts cleanup dùng Node `fs` APIs (`fs.rmSync`, `fs.unlinkSync`, `fs.mkdirSync`) → cross-platform.

### Quyền ghi (Linux/macOS)

Nếu thấy lỗi khi upload hoặc render:

```bash
mkdir -p public/uploads public/out
chmod 755 public/uploads public/out
```

### GPU acceleration cho Remotion (Chrome headless)

Trong `src/app/api/render/route.ts`:

- `chromiumOptions.gl` được chọn tự động theo `process.platform`:

  - **Windows**: `"angle"`  
  - **Linux**: `"egl"` (hoặc thay `"swangle"` nếu gặp lỗi GPU)  
  - **macOS**: `"swangle"` hoặc `undefined` (Remotion tự chọn)

Nếu trên Linux gặp lỗi liên quan GPU, có thể sửa nhanh (nếu cần):

```ts
chromiumOptions: {
  gl: "swangle",
}
```

### Linux headless (server không có GUI)

Nếu chạy trên server không có màn hình:

- Cài `xvfb`:

  ```bash
  sudo apt-get install xvfb
  xvfb-run -a npm run dev
  ```

Hoặc set `DISPLAY` nếu bạn đã có X server:

```bash
export DISPLAY=:99
```

---

## 7. Dọn dẹp file nặng (cache, output, uploads)

### Tự động (qua script)

Chạy:

```bash
npm run clean
```

- Xoá nội dung:
  - `public/uploads` (file upload của user),
  - `public/out` (file render),
  - `.remotion`,
  - `node_modules/.cache/remotion` (nếu có).
- Thư mục gốc vẫn giữ lại (không xoá folder).

### Bên ngoài dự án

Không có “rác riêng” của dự án, nhưng bạn nên biết:

- **Cache npm**:
  - `C:\Users\<USER>\AppData\Roaming\npm-cache` (Windows)
  - `~/.npm` (Unix)
- **Thư mục tạm của hệ điều hành**:
  - `%TEMP%` trên Windows,
  - `/tmp` trên Linux/macOS.
- **Cache trình duyệt** (Chrome/Edge) cho `localhost`.

Nếu thiếu dung lượng, có thể dọn chúng như thói quen chung (Disk Cleanup, Clear browsing data, v.v.).

---

## 8. Kiểm tra chất lượng & debug

- **Linter**:

  ```bash
  npm run lint
  ```

- **Nếu clone sang máy khác / OS khác**:

  ```bash
  node --version
  npm install
  ffmpeg -version
  npm run dev
  ```

Nếu có lỗi:

1. Xem log trong terminal của Next.js.
2. Xem log ở tab Network/Console của trình duyệt.
3. Đảm bảo FFmpeg & Chrome/Chromium đã cài đúng.
4. Kiểm tra quyền thư mục `public/uploads`, `public/out`.

---

## 9. License & Remotion

Dự án này sử dụng Remotion (`remotion`, `@remotion/player`, `@remotion/bundler`, `@remotion/lambda`, ...).

- Remotion có license riêng, tuỳ thuộc bạn là cá nhân hay công ty.
- Xem chi tiết:  
  `https://github.com/remotion-dev/remotion/blob/main/LICENSE.md`

---
