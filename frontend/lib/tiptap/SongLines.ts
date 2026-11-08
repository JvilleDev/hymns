import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Marcadores de sección ("1", "2", "CORO", "Pre-CORO"): también son líneas proyectadas
export const isSongMarker = (line: string) =>
  /^\s*(\d+|(pre-?)?coro|puente|final|intro)\s*:?\s*$/i.test(line)

/**
 * Cada párrafo es una línea y todas se numeran, también las vacías (son líneas y pueden
 * provocar errores de índice). Resalta los marcadores de sección, atenúa las vacías y marca
 * la línea del cursor. Todo vía decoraciones: el documento sigue siendo texto plano.
 */
export const SongLines = Extension.create({
  name: 'songLines',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('songLines'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const { $from } = state.selection
            let n = 0

            state.doc.forEach((node, offset) => {
              const text = node.textContent
              const classes: string[] = []
              const attrs: Record<string, string> = {}

              n++
              attrs['data-n'] = String(n)
              if (!text.trim()) classes.push('song-line-empty')
              else if (isSongMarker(text)) classes.push('song-line-marker')
              if ($from.parent === node) classes.push('song-line-active')

              if (classes.length) attrs.class = classes.join(' ')
              decorations.push(Decoration.node(offset, offset + node.nodeSize, attrs))
            })

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
