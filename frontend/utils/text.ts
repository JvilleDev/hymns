export function checkTags(text: string): string {
  // Quitar espacios iniciales
  const cleanText = text.trimStart()

  // Optimización: regex compiladas una sola vez
  const regexMark = /^(?:\d+|[->]|FINAL|(?:CORO|PRE[-]?CORO|ESTRIBILLO))/
  const regexTag = /^Al\s+(?:CORO|PRE-CORO|PRECORO|FINAL)(?:\s+\d+)?/i

  if (regexMark.test(cleanText)) return 't-mark'
  if (regexTag.test(cleanText)) return 'tag-mark'
  return ''
}
