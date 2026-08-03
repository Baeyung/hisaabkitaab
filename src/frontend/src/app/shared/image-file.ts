import { TranslationKey } from '../core/i18n/translations/en';

// ponytail: base64-image-in-DB stopgap — this cap keeps a store row and every
// GET /api/stores payload sane until bucket upload lands (docs/tickets/HK-store-media-object-storage.md).
const MAX_IMAGE_BYTES = 300 * 1024;

/**
 * Reads a picked logo/watermark as a base64 data URI, or says why it can't.
 * Shared by Settings › General and the guided setup, which take the same two
 * images under the same size cap — the rejection message is a translation key
 * so each screen shows it in its own layout.
 */
export async function readImageFile(
  file: File,
): Promise<{ uri: string; error?: never } | { uri?: never; error: TranslationKey }> {
  if (!file.type.startsWith('image/')) {
    return { error: 'settings.general.imageType' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: 'settings.general.imageTooBig' };
  }
  const reader = new FileReader();
  const uri = await new Promise<string>((resolve) => {
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
  return { uri };
}
