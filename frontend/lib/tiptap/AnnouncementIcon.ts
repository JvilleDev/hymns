import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import IconNodeView from '~/components/tiptap/IconNodeView.vue'

export const AnnouncementIcon = Node.create({
  name: 'announcementIcon',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: element => element.getAttribute('data-icon'),
        renderHTML: attributes => {
          if (!attributes.name) {
            return {}
          }
          return {
            'data-icon': attributes.name,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-icon]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'announcement-icon' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(IconNodeView)
  },
})
