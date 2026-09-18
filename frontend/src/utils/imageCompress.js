/**
 * src/utils/imageCompress.js
 * ---------------------------------------------------------------------------
 * Nén ảnh NGAY TRÊN TRÌNH DUYỆT trước khi gửi lên máy chủ.
 *
 * Vì sao làm ở đây mà không làm ở backend?
 *   • Máy chủ là chiếc điện thoại Android. Nén bằng thư viện C (sharp) trên
 *     Termux rất khó cài; còn `canvas` của trình duyệt đã tối ưu bằng native
 *     nên nhanh hơn nhiều và **không tốn CPU của máy chủ**.
 *   • Ảnh 12 MP của điện thoại ≈ 4–6 MB → sau khi thu nhỏ cạnh dài về 2048 px
 *     và lưu JPEG chất lượng 0.82 thường còn 400–900 KB: tải nhanh hơn qua
 *     4G nhà bạn, album nhỏ hơn ~5 lần, ảnh xem trên web vẫn nét.
 *
 * Nguyên tắc:
 *   • Không bao giờ phóng to ảnh (chỉ thu nhỏ).
 *   • GIF động: BỎ QUA (canvas sẽ làm mất chuyển động).
 *   • PNG/ảnh có nền trong suốt: giữ định dạng PNG, chỉ thu nhỏ kích thước.
 *   • Nếu nén xong lại NẶNG HƠN bản gốc thì trả lại bản gốc.
 *   • Mọi lỗi đều trả về tệp gốc — nén là tính năng phụ, không được chặn đăng bài.
 * ---------------------------------------------------------------------------
 */

/** Cạnh dài tối đa sau khi nén (px). 2048 đủ nét cho TV 4K khi xem toàn màn hình. */
export const DEFAULT_MAX_DIMENSION = 2048;

/** Chất lượng JPEG/WebP (0–1). 0.82 là điểm cân bằng quen thuộc của ảnh web. */
export const DEFAULT_QUALITY = 0.82;

/** Dưới ngưỡng này thì nén chẳng được bao nhiêu → gửi thẳng bản gốc. */
export const MIN_BYTES_TO_BOTHER = 300 * 1024;

/* -------------------------------------------------------------------------- */
/*                     Hàm thuần (test được bằng Node)                        */
/* -------------------------------------------------------------------------- */

/**
 * Kích thước mới sau khi thu nhỏ, GIỮ NGUYÊN tỉ lệ và không phóng to.
 * @returns {{width: number, height: number, scaled: boolean}}
 */
export function targetDimensions(width, height, maxDimension = DEFAULT_MAX_DIMENSION) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return { width: 0, height: 0, scaled: false };

  const longest = Math.max(w, h);
  if (longest <= maxDimension) return { width: Math.round(w), height: Math.round(h), scaled: false };

  const ratio = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
    scaled: true,
  };
}

/** Định dạng đầu ra: PNG giữ PNG, còn lại chuyển JPEG (nhẹ hơn nhiều). */
export function outputMimeType(inputType = '') {
  return String(inputType).toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
}

/** Tên tệp sau khi nén — đổi phần mở rộng cho khớp định dạng mới. */
export function outputFileName(name = 'photo', mimeType = 'image/jpeg') {
  const base = String(name).replace(/\.[^.]+$/, '') || 'photo';
  return `${base}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

/** Có nên thử nén tệp này không? (quyết định thuần, không cần DOM) */
export function shouldCompress({ type = '', size = 0 } = {}) {
  const mime = String(type).toLowerCase();
  if (!mime.startsWith('image/')) return false;
  if (mime === 'image/gif') return false; // giữ chuyển động
  if (mime === 'image/svg+xml') return false; // ảnh vector, nén vô nghĩa
  return Number(size) > MIN_BYTES_TO_BOTHER;
}

/** "4.2 MB" — dùng cho dòng thông báo tiết kiệm dung lượng. */
export function formatBytes(bytes, locale = 'vi') {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  // vi/en/zh đều dùng dấu chấm thập phân; Intl lo phần làm tròn theo ngôn ngữ.
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
}

/** Tính mức tiết kiệm: { savedBytes, savedPercent, smaller } */
export function savings(originalBytes, compressedBytes) {
  const before = Number(originalBytes) || 0;
  const after = Number(compressedBytes) || 0;
  const savedBytes = Math.max(0, before - after);
  return {
    savedBytes,
    savedPercent: before > 0 ? Math.round((savedBytes / before) * 100) : 0,
    smaller: after > 0 && after < before,
  };
}

/* -------------------------------------------------------------------------- */
/*                        Phần cần trình duyệt (DOM)                          */
/* -------------------------------------------------------------------------- */

/** Giải mã tệp thành ảnh đã áp dụng đúng chiều EXIF của điện thoại. */
async function decodeImage(file) {
  // createImageBitmap xử lý EXIF (ảnh chụp dọc) đúng chuẩn và nhanh hơn <img>.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* Safari cũ: rơi xuống nhánh <img> bên dưới */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    image.src = url;
  });
}

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      return;
    }
    // Trình duyệt rất cũ: dùng dataURL rồi đổi sang Blob.
    try {
      const [, base64] = canvas.toDataURL(mimeType, quality).split(',');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: mimeType }));
    } catch {
      resolve(null);
    }
  });

/**
 * Nén một tệp ảnh. LUÔN trả về tệp dùng được (gốc nếu không nén được).
 *
 * @returns {Promise<{file: File, originalFile: File, compressed: boolean,
 *                    originalBytes: number, bytes: number, width: number, height: number,
 *                    savedPercent: number}>}
 */
export async function compressImage(file, options = {}) {
  const { maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY } = options;

  const passthrough = (reason) => ({
    file,
    originalFile: file,
    compressed: false,
    reason,
    originalBytes: file.size,
    bytes: file.size,
    width: 0,
    height: 0,
    savedPercent: 0,
  });

  if (!shouldCompress(file)) return passthrough('skipped');

  try {
    const source = await decodeImage(file);
    const sourceWidth = source.width || source.naturalWidth || 0;
    const sourceHeight = source.height || source.naturalHeight || 0;
    const target = targetDimensions(sourceWidth, sourceHeight, maxDimension);

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return passthrough('no-canvas');

    // Nền trắng cho JPEG (ảnh PNG trong suốt chuyển sang JPEG sẽ bị đen nếu bỏ qua).
    const mimeType = outputMimeType(file.type);
    if (mimeType === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, target.width, target.height);
    }
    context.drawImage(source, 0, 0, target.width, target.height);
    if (typeof source.close === 'function') source.close();

    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!blob) return passthrough('encode-failed');

    const result = savings(file.size, blob.size);
    if (!result.smaller) return passthrough('not-smaller');

    const compressedFile = new File([blob], outputFileName(file.name, mimeType), {
      type: mimeType,
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      originalFile: file,
      compressed: true,
      reason: 'ok',
      originalBytes: file.size,
      bytes: compressedFile.size,
      width: target.width,
      height: target.height,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      savedPercent: result.savedPercent,
    };
  } catch (error) {
    // Nén là tính năng phụ: có lỗi thì gửi bản gốc, không chặn người dùng.
    return passthrough(`error:${error.message}`);
  }
}

export default compressImage;
