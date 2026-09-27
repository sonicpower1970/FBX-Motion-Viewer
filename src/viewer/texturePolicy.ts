// A local one-pixel placeholder: rejected references must never reach the network.
export const MISSING_TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

export function isEmbeddedTexture(url: string) {
  return /^data:image\/(png|jpe?g|webp|gif|bmp);base64,/i.test(url) ||
    /^blob:(https?:\/\/[^/]+|null)\//.test(url)
}

export function resolveTexture(url: string, warn: (warning: string) => void) {
  if (isEmbeddedTexture(url)) return url
  const basename = url.replace(/\\/g, '/').split('/').pop()?.split(/[?#]/)[0] || 'unnamed texture'
  warn(`External texture unavailable: ${basename.slice(0, 120)}. Using a neutral material.`)
  return MISSING_TEXTURE
}
