/**
 * Resize + JPEG-compress images before Firebase Storage upload.
 * Non-images (e.g. PDF) are returned unchanged.
 */
export async function compressImageFile(
  file,
  { maxWidth = 1280, maxHeight = 1280, quality = 0.75, mimeType = 'image/jpeg' } = {}
) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file;
  }

  // Skip tiny files already under ~200KB
  if (file.size < 200 * 1024 && file.type === 'image/jpeg') {
    return file;
  }

  const bitmap = await loadImageBitmap(file);
  try {
    let { width, height } = bitmap;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    });

    if (!blob || blob.size === 0) return file;

    // Prefer compressed only if smaller
    if (blob.size >= file.size * 0.95 && file.size < 500 * 1024) {
      return file;
    }

    const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

async function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}

/** Logo: smaller max edge */
export function compressLogoFile(file) {
  return compressImageFile(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.85 });
}

/** Job / part-request photos */
export function compressPhotoFile(file) {
  return compressImageFile(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.75 });
}
