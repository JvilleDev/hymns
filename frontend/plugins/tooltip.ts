export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('tooltip', {
    mounted(el, binding) {
      if (!binding.value) return

      const show = () => {
        window.dispatchEvent(new CustomEvent('tooltip-show', {
          detail: { el, text: binding.value }
        }))
      }

      const hide = () => {
        window.dispatchEvent(new CustomEvent('tooltip-hide'))
      }

      el.addEventListener('mouseenter', show)
      el.addEventListener('mouseleave', hide)
      el.addEventListener('click', hide)

      // Store listeners to remove them on unmount
      el._tooltipShow = show
      el._tooltipHide = hide
    },
    unmounted(el) {
      el.removeEventListener('mouseenter', el._tooltipShow)
      el.removeEventListener('mouseleave', el._tooltipHide)
      el.removeEventListener('click', el._tooltipHide)
    },
    updated(el, binding) {
      if (binding.value !== binding.oldValue) {
        // Update functionality if needed, though simple enough for now
      }
    }
  })
})
