import { VueRenderer } from '@tiptap/vue-3'
import tippy from 'tippy.js'
import CommandList from '~/components/tiptap/CommandList.vue'
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'

export default {
  items: ({ query }) => {
    const { icons: availableIcons } = useAnnouncementIcons()
    return availableIcons
      .filter(item => 
        item.name.toLowerCase().includes(query.toLowerCase()) || 
        item.label.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 10)
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
