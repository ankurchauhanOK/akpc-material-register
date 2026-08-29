// Client-side image compression before upload (design.md §11).
// Preserves enough resolution for challan text while avoiding huge originals.

const MAX_DIMENSION = 1600;
const MAX_SIZE_BYTES = 1_500_000; // ~1.5 MB trigger
const JPEG_QUALITY = 0.8;

export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export function isAcceptedFile(file: File): boolean {
  return ACCEPTED_MIME.includes(file.type);
}

/**
 * Returns the file to upload. Images above a size threshold are compressed
 * (and re-encoded as JPEG). PDFs and small images pass through unchanged.
 */
export async function maybeCompressImage(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= MAX_SIZE_BYTES) return file;

  return new Promise<File>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error("Could not compress image"));
              return;
            }
            const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

/** Builds an object URL for preview (caller must revoke). */
export function objectUrlForPreview(file: File): string {
  return URL.createObjectURL(file);
}
