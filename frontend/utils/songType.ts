// El backend guarda y filtra por type === 'Especial'. En la interfaz esa categoría
// se muestra con el nombre de su autor, sin tocar el valor que viaja al backend.
export const SPECIAL_TYPE = 'Especial'
export const SPECIAL_LABEL = 'DR. JBP'

export const songTypeLabel = (type: string) => (type === SPECIAL_TYPE ? SPECIAL_LABEL : type)

// El backend arma la cabecera proyectada como "ESPECIAL - TÍTULO": se reescribe al recibirla
export const renameSpecialHeader = (song: any) => {
  const first = song?.lines?.[0]
  if (typeof first !== 'string' || !/^ESPECIAL - /.test(first)) return song
  return { ...song, lines: [first.replace(/^ESPECIAL - /, `${SPECIAL_LABEL} - `), ...song.lines.slice(1)] }
}

// Los de DR. JBP ('Especial') van en orden alfabético (sin acentos ni signos iniciales como ¡ ¿ " ).
// Los cantos conservan su orden y los especiales ocupan los mismos lugares que ya tenían.
export const sortSpecialsAlphabetically = <T extends { type: string; title: string }>(list: T[]): T[] => {
  const idx: number[] = []
  const specials: T[] = []
  list.forEach((song, i) => {
    if (song.type === SPECIAL_TYPE) {
      idx.push(i)
      specials.push(song)
    }
  })
  if (specials.length < 2) return list

  const key = (t: string) => (t ?? '').replace(/^[^\p{L}\p{N}]+/u, '')
  specials.sort((a, b) => key(a.title).localeCompare(key(b.title), 'es', { sensitivity: 'base', numeric: true }))

  const result = [...list]
  idx.forEach((pos, n) => { result[pos] = specials[n] })
  return result
}
