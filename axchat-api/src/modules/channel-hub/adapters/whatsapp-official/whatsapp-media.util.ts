/**
 * Meta Cloud API is picky about audio MIME — `audio/ogg` alone is rejected;
 * the multipart part must use `audio/ogg; codecs=opus` (see Meta error 131053).
 */
export function whatsappMediaUploadMeta(
  mimeType: string,
  filename: string,
): { type: string; contentType: string } {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  const name = (filename || '').toLowerCase();

  if (base === 'audio/ogg' || name.endsWith('.ogg')) {
    return { type: 'audio/ogg', contentType: 'audio/ogg; codecs=opus' };
  }
  if (base === 'audio/mpeg' || name.endsWith('.mp3')) {
    return { type: 'audio/mpeg', contentType: 'audio/mpeg' };
  }
  if (base === 'audio/mp4' || base === 'audio/m4a' || name.endsWith('.m4a')) {
    return { type: 'audio/mp4', contentType: 'audio/mp4' };
  }
  if (base === 'audio/aac' || name.endsWith('.aac')) {
    return { type: 'audio/aac', contentType: 'audio/aac' };
  }
  if (base === 'audio/amr' || name.endsWith('.amr')) {
    return { type: 'audio/amr', contentType: 'audio/amr' };
  }

  return {
    type: base || 'application/octet-stream',
    contentType: mimeType || 'application/octet-stream',
  };
}
