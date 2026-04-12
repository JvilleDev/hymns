import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const SpecialTextHighlight = Extension.create({
  name: 'specialTextHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, set) {
            // Adjust decoration positions to follow transactions
            set = set.map(tr.mapping, tr.doc)

            // Re-calculate decorations for the whole document on update
            // (For a small document like an announcement, this is efficient enough)
            const decorations: Decoration[] = []
            const text = tr.doc.textBetween(0, tr.doc.content.size, ' ')
            
            // Regex for WSS: and WMB
            const patterns = [
              { regex: /WSS:/g, class: 'text-red-600 font-black' },
              { regex: /WMB/g, class: 'text-purple-600 font-black' }
            ]

            tr.doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                patterns.forEach(({ regex, class: className }) => {
                  let match
                  while ((match = regex.exec(node.text!)) !== null) {
                    const start = pos + match.index
                    const end = start + match[0].length
                    decorations.push(
                      Decoration.inline(start, end, {
                        class: className
                      })
                    )
                  }
                })
              }
            })

            return DecorationSet.create(tr.doc, decorations)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
