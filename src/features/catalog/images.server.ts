import "server-only";
import sharp from "sharp";
export async function prepareImage(file: File) {
  if (!file.size || file.size > 2097152 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image up to 2 MiB.");
  const source = Buffer.from(await file.arrayBuffer());
  const decoder = sharp(source, { limitInputPixels: 16000000, failOn: "warning" });
  const metadata = await decoder.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Use a still JPEG, PNG or WebP image.");
  return decoder.rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}
