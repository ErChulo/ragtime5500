export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
