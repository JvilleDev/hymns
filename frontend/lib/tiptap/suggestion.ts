import { VueRenderer } from '@tiptap/vue-3'
import tippy from 'tippy.js'
import CommandList from '~/components/tiptap/CommandList.vue'
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'

export default {
  items: ({ query }) => {
    const { icons: availableIcons } = useAnnouncementIcons()
    const q = query.trim().toLowerCase()

    // Prioridad: exacta > prefijo > inicio de palabra (separadas por -, _ o espacio) > contiene.
    // Dentro de cada grupo gana el nombre más corto y luego el orden alfabético.
    const rank = (item: any): number => {
      const name = String(item.name).toLowerCase()
      const label = String(item.label || '').toLowerCase()
      if (name === q || label === q) return 0
      if (name.startsWith(q)) return 1
      if (name.split(/[-_\s]+/).some(w => w.startsWith(q))) return 2
      if (name.includes(q)) return 3
      if (label.includes(q)) return 4
      return -1
    }

    const list = q
      ? availableIcons.value
          .map(item => ({ item, r: rank(item) }))
          .filter(x => x.r >= 0)
          .sort((x, y) =>
            x.r - y.r ||
            String(x.item.name).length - String(y.item.name).length ||
            String(x.item.name).localeCompare(String(y.item.name))
          )
          .map(x => x.item)
      : availableIcons.value

    return list
      .slice(0, 30)
      .map(item => ({
        ...item,
        command: ({ editor, range }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'announcementIcon',
                attrs: { name: item.name },
              },
              {
                type: 'text',
                text: ' ',
              },
            ])
            .run()
        },
      }))
  },

  render: () => {
    let component
    let popup

    return {
      onStart: (props) => {
        component = new VueRenderer(CommandList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) {
          return
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },

      onUpdate(props) {
        component.updateProps(props)

        if (!props.clientRect) {
          return
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        })
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup[0].hide()
          return true
        }

        return component.ref?.onKeyDown(props)
      },

      onExit() {
        popup[0].destroy()
        component.destroy()
      },
    }
  },
}
