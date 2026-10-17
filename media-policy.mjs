export const IMAGE_TARGET_BYTES = 20 * 1024;
export const IMAGE_MAX_BYTES = 100 * 1024;
export const AUDIO_MAX_BYTES = 1024 * 1024;
export function dataUrlBytes(value) {
  const encoded = String(value).split(',')[1] || '';
  return Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
}
export function readBlobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read attachment. Please select it again.'));
    reader.readAsDataURL(blob);
  });
}
// Preserve document detail before chasing the smaller target. Never silently
// shrink a full-page document to a tiny thumbnail just to satisfy the ceiling.
export async function compressImageDataUrl(file) {
  if (!file || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Choose a JPEG, PNG, WebP or GIF image.');
  if (file.size <= IMAGE_TARGET_BYTES) return readBlobDataUrl(file);
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not open image. Try a JPEG, PNG or WebP photo.')); image.src = url; });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    const original = Math.max(image.naturalWidth, image.naturalHeight);
    for (const edge of [...new Set([Math.min(original, 2000), Math.min(original, 1600), Math.min(original, 1200)])]) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * edge / original));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * edge / original));
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let best = '';
      for (const quality of [0.88, 0.8, 0.72]) {
        let data = canvas.toDataURL('image/webp', quality);
        if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', quality);
        const bytes = dataUrlBytes(data);
        if (bytes <= IMAGE_TARGET_BYTES) return data;
        if (!best && bytes <= IMAGE_MAX_BYTES) best = data;
      }
      if (best) return best;
    }
    if (file.size <= IMAGE_MAX_BYTES) return readBlobDataUrl(file);
    throw new Error('This image needs more than 100 KB to retain detail. Crop to the ticket or trip card and try again. Check that all text is readable.');
  } finally { URL.revokeObjectURL(url); }
}
