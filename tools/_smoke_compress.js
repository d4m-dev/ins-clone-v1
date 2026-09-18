#!/usr/bin/env node
'use strict';

/**
 * tools/_smoke_compress.js — kiểm thử phần THUẦN của bộ nén ảnh phía trình duyệt.
 * ---------------------------------------------------------------------------
 *   node tools/_smoke_compress.js
 *
 * Phần vẽ canvas cần trình duyệt nên không test ở đây; nhưng phần QUYẾT ĐỊNH
 * (giữ tỉ lệ, không phóng to, chọn định dạng, tính mức tiết kiệm) mới là chỗ dễ
 * sai — và đó chính là những gì script này kiểm tra.
 * ---------------------------------------------------------------------------
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE = pathToFileURL(
  path.resolve(__dirname, '..', 'frontend', 'src', 'utils', 'imageCompress.js')
).href;

const results = [];
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

(async () => {
  const { targetDimensions, outputMimeType, outputFileName, shouldCompress, savings, formatBytes } =
    await import(MODULE);

  /* ---------------------------- giữ đúng tỉ lệ ---------------------------- */
  const landscape = targetDimensions(4000, 3000, 2048);
  check(
    'Ảnh ngang 4000×3000 → 2048×1536 (giữ 4:3)',
    landscape.width === 2048 && landscape.height === 1536 && landscape.scaled,
    `${landscape.width}×${landscape.height}`
  );

  const portrait = targetDimensions(3000, 4000, 2048);
  check(
    'Ảnh dọc 3000×4000 → 1536×2048',
    portrait.width === 1536 && portrait.height === 2048,
    `${portrait.width}×${portrait.height}`
  );

  const panorama = targetDimensions(6000, 1500, 2048);
  check(
    'Ảnh panorama 6000×1500 → 2048×512',
    panorama.width === 2048 && panorama.height === 512,
    `${panorama.width}×${panorama.height}`
  );

  /* ------------------------- không bao giờ phóng to ----------------------- */
  const small = targetDimensions(800, 600, 2048);
  check('Ảnh nhỏ 800×600 giữ nguyên', small.width === 800 && small.height === 600 && !small.scaled);

  const exactlyAtLimit = targetDimensions(2048, 2048, 2048);
  check('Đúng ngưỡng 2048×2048 không bị nén thêm', !exactlyAtLimit.scaled);

  check('Kích thước 0 → không chia cho 0', targetDimensions(0, 0).width === 0);
  check('Kích thước âm/rác → trả 0', targetDimensions(undefined, -5).height === 0);

  /* ------------------------------ định dạng ------------------------------- */
  check('PNG giữ PNG', outputMimeType('image/png') === 'image/png');
  check('JPEG → JPEG', outputMimeType('image/jpeg') === 'image/jpeg');
  check('HEIC/WebP lạ → JPEG', outputMimeType('image/heic') === 'image/jpeg');
  check(
    'Tên tệp đổi đúng phần mở rộng',
    outputFileName('IMG_20260918_1201.heic', 'image/jpeg') === 'IMG_20260918_1201.jpg' &&
      outputFileName('avatar.png', 'image/png') === 'avatar.png' &&
      outputFileName('khong-co-duoi', 'image/jpeg') === 'khong-co-duoi.jpg',
    outputFileName('IMG_20260918_1201.heic', 'image/jpeg')
  );

  /* --------------------------- khi nào thì nén ---------------------------- */
  check('Ảnh 4 MB → nén', shouldCompress({ type: 'image/jpeg', size: 4 * 1024 * 1024 }) === true);
  check('Ảnh 100 KB → gửi thẳng', shouldCompress({ type: 'image/jpeg', size: 100 * 1024 }) === false);
  check('GIF động → KHÔNG nén (mất chuyển động)', shouldCompress({ type: 'image/gif', size: 8 * 1024 * 1024 }) === false);
  check('SVG → KHÔNG nén', shouldCompress({ type: 'image/svg+xml', size: 900 * 1024 }) === false);
  check('Video → KHÔNG nén ở đây', shouldCompress({ type: 'video/mp4', size: 40 * 1024 * 1024 }) === false);

  /* ----------------------------- mức tiết kiệm ---------------------------- */
  const saved = savings(4 * 1024 * 1024, 700 * 1024);
  check('Tính đúng % tiết kiệm (4 MB → 700 KB ≈ 83%)', saved.savedPercent === 83, `${saved.savedPercent}%`);
  check('Bản nén nhẹ hơn ⇒ smaller = true', saved.smaller === true);
  check('Bản nén NẶNG hơn ⇒ không nhận', savings(500 * 1024, 620 * 1024).smaller === false);
  check('Không trả số âm khi tệp rỗng', savings(0, 0).savedPercent === 0);

  check('Đọc dung lượng dễ hiểu', formatBytes(4 * 1024 * 1024) === '4 MB', formatBytes(4 * 1024 * 1024));
  check('Dung lượng lẻ có 1 chữ số thập phân', formatBytes(1536 * 1024) === '1,5 MB' || formatBytes(1536 * 1024) === '1.5 MB', formatBytes(1536 * 1024));
  check('Nhỏ hơn 1 KB hiển thị B', formatBytes(512) === '512 B');

  console.log(results.join('\n'));
  console.log(`\n${failures === 0 ? '🎉 TẤT CẢ ĐỀU ĐẠT' : `⚠️  ${failures} phép thử thất bại`}  (${results.length} phép thử)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error('❌ Không nạp được module nén ảnh:', error.message);
  process.exit(1);
});
