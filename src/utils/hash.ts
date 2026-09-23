export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = bytes instanceof Uint8Array
    ? (() => {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
      })()
    : bytes.slice(0);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
