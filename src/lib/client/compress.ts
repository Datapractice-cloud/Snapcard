/**
 * Shrinks a camera photo before it leaves the phone.
 *
 * A modern phone camera produces 4–12 MB per shot. Gemini reads a business
 * card perfectly well at 1600px, and the same bytes are later stored as a
 * Salesforce attachment and sent again on every outbox retry — so this runs
 * once, on the device, over booth wifi that is usually terrible.
 *
 * Browser only: uses canvas and createImageBitmap.
 */

/** Long edge, in pixels. Card text stays legible well below this. */
export const MAX_EDGE = 1600;

export const JPEG_QUALITY = 0.8;

/**
 * Scales to fit inside `maxEdge` on the long side, preserving aspect ratio.
 * Never scales up — a small photo is left alone.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };

  const scale = maxEdge / longest;
  return {
    // Rounded, and never zero: a canvas of width 0 throws.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decodes the file the right way up.
 *
 * iPhones record orientation in EXIF rather than rotating the pixels, so a
 * card photographed in portrait arrives sideways unless the decoder is told to
 * apply it. `imageOrientation: "from-image"` does that; the fallbacks cover
 * browsers that reject the option or lack createImageBitmap, where <img>
 * auto-orients on its own.
 */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // Fall through to the <img> path.
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The image could not be decoded."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

export async function compressImage(file: Blob): Promise<Blob> {
  const source = await decode(file);
  const natural = sizeOf(source);
  const { width, height } = fitWithin(natural.width, natural.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser would not give us a canvas.");

  context.drawImage(source, 0, 0, width, height);
  if (!(source instanceof HTMLImageElement)) source.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) throw new Error("The image could not be compressed.");
  return blob;
}

/** `LeadSubmit.images[].dataUrl` wants base64, not an object URL. */
export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}

/** "412 KB" — shown under each preview so a rep can see it is small. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
