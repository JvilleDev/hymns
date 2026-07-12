import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const SpecialTextHighlight = Extension.create({
  name: 'specialTextHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('specialTextHighlight'),
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, set) {
            set = set.map(tr.mapping, tr.doc)
            
            const decorations: Decoration[] = []
            
            tr.doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                const patterns = [
                  { regex: /WSS:/g, class: 'text-red-600 font-black' },
                  { regex: /WMB/g, class: 'text-purple-600 font-black' }
                ]

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
