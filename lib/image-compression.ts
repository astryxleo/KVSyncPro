export type ImageCompressionOptions = {
  maxDimension: number;
  quality: number;
  fileName?: string;
};

/**
 * Re-encodes browser-supported images as WebP, resizing only when necessary.
 * Non-image documents should never be passed here: they are kept byte-for-byte.
 */
export async function compressImageForUpload(
  source: File,
  options: ImageCompressionOptions,
): Promise<File> {
  if (!source.type.startsWith("image/")) return source;
  if (source.type === "image/gif" || source.type === "image/svg+xml") {
    throw new Error("Animated GIF and SVG files are not supported. Choose a JPG, PNG, WEBP or AVIF image.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image could not be opened. Please choose another image.");
  }

  try {
    const scale = Math.min(1, options.maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Image compression is unavailable in this browser.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Image compression failed. Please try another image.")),
        "image/webp",
        options.quality,
      );
    });
    if (blob.type !== "image/webp") {
      throw new Error("WebP compression is not supported in this browser. Please use an updated browser.");
    }
    const originalName = options.fileName ?? source.name.replace(/\.[^.]+$/, "");
    return new File([blob], originalName.replace(/\.[^.]+$/, "") + ".webp", {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
