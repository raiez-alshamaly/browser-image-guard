/**
 * HEIC / HEIF → JPEG conversion.
 *
 * `heic2any` is imported lazily and declared as an OPTIONAL peer dependency, so
 * the libheif WASM payload (a few hundred KB) only loads the first time a user
 * actually picks a HEIC file. Apps that never touch HEIC pay nothing.
 *
 * iPhones shoot HEIC by default, and most backends can't decode it — converting
 * client-side sidesteps that entirely.
 */
import { UploadValidationError } from "./errors";

type Heic2AnyFn = (options: {
  blob: Blob;
  toType?: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

export async function convertHeicToJpeg(file: File): Promise<File> {
  let heic2any: Heic2AnyFn;
  try {
    const mod = (await import("heic2any")) as unknown as {
      default?: Heic2AnyFn;
    } & Heic2AnyFn;
    heic2any = (mod.default ?? mod) as Heic2AnyFn;
  } catch (err) {
    // The optional dependency isn't installed — surface a clear, actionable error.
    throw new UploadValidationError("HeicSupportMissing", err);
  }

  let converted: Blob | Blob[];
  try {
    converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  } catch (err) {
    throw new UploadValidationError("HeicConvertFailed", err);
  }

  // A multi-image HEIC (burst / live photo) yields an array — keep the first frame.
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob) {
    throw new UploadValidationError("HeicConvertFailed");
  }
  const base = file.name.replace(/\.(heic|heif)$/i, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
