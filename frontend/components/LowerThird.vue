<script setup lang="ts">
import { useAnnouncementIcons } from '@/composables/useAnnouncementIcons'

const props = withDefaults(defineProps<{
  text: string,
  position?: 'top' | 'bottom'
}>(), {
  position: 'bottom'
})

const { icons } = useAnnouncementIcons()

const repeatCount = ref(20) // Start with a safe lower default
const containerWidth = ref(1920) // Default HD width

const isScrollable = ref(true)



// Compute simple text length without formatting tags for metrics
const strippedText = computed(() => {
  let s = props.text
  // Remove markdown symbols
  s = s.replace(/\*\*/g, '').replace(/\*/g, '')
  // Remove color tags
  s = s.replace(/\[\/?(red|blue|purple)\]/gi, '')
  s = s.replace(/\[\/\]/g, '')
  // Remove icon commands /triangle, etc.
  icons.forEach(icon => {
     const re = new RegExp(`(^|\\s)/${icon.name}(\\s|$)`, 'gi')
     s = s.replace(re, '  ') 
  })
  return s
})

const parsedContent = computed(() => {
  const segments: Array<{ type: 'text' | 'icon', value: string, class?: string }> = []
  
  // Regex to capture:
  // 1. Color tags [red], [/red], [/]
  // 2. Formatting markers **, *
  // 3. Icon shortcodes /name
  // We construct the icon regex part dynamically from available icons
  const iconNames = icons.map(i => i.name).join('|')
  const regex = new RegExp(`(\\[/?(?:red|blue|purple)\\]|\\[/\\]|\\*\\*|\\*|/(?:${iconNames}))`, 'gi')
  
  const parts = props.text.split(regex)
  
  // Style State
  let color = ''
  let bold = false
  let italic = false
  
  parts.forEach(part => {
    if (!part) return // skip empty strings from split
    
    // 1. Handle Tags
    if (part.startsWith('[') && part.endsWith(']')) {
        const content = part.slice(1, -1).toLowerCase()
        if (content.startsWith('/') || content === '/') {
            // closing tag [/red] or [/]
            color = ''
        } else {
            // opening tag [red]
             if (['red', 'blue', 'purple'].includes(content)) {
                 color = content
             }
        }
        return
    }
    
    // 2. Handle Formatting
    if (part === '**') {
        bold = !bold
        return
    }
    
    if (part === '*') {
        italic = !italic
        return
    }
    
    // 3. Handle Icons
    if (part.startsWith('/')) {
        const name = part.slice(1).toLowerCase()
        const iconDef = icons.find(i => i.name === name)
        if (iconDef) {
             // Determine default color for specific icons
             let iconColorClass = ''
             if (name === 'check') iconColorClass = 'text-green-500'
             else if (name === 'heart') iconColorClass = 'text-red-500'
             else if (name === 'star') iconColorClass = 'text-yellow-500'
             
             // If user specified a color, it overrides default? 
             // Or merges? "text-blue-600 text-red-500" -> conflict.
             // Let's say user color takes precedence if present.
             const finalColorClass = color ? `text-${color}-600` : iconColorClass

             segments.push({
                 type: 'icon',
                 value: iconDef.icon,
                 class: `inline-block align-text-bottom mb-1 size-[1.2em] ${finalColorClass}`
             })
             return 
        }
    }
    
    // 4. Handle Text
    // Apply WSS/WMB replacements here as HTML
    let text = part
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
    
    text = text.replace(/WSS:/gi, '<span class="text-red-600">WSS:</span>')
    text = text.replace(/WMB/gi, '<span class="text-purple-600">WMB</span>')
    
    const classes = [
        color ? `text-${color}-600 pb-2 inline-block` : '',
        bold ? 'font-black' : '', 
        italic ? 'italic' : ''
    ].filter(Boolean).join(' ')
    
    segments.push({
        type: 'text',
        value: text,
        class: classes
    })
  })
  
  return segments
})

const measureRef = ref<HTMLElement | null>(null)

const updateMetrics = async () => {
  if (typeof window === 'undefined') return
  
  // Wait for DOM update so measureRef has latest content
  await nextTick()
  
  if (!measureRef.value) return
  
  containerWidth.value = window.innerWidth
  
  // Measure the actual width of one item
  // We use .scrollWidth or .offsetWidth
  const contentWidth = measureRef.value.offsetWidth
  
  // If content fits within screen (with some safety buffer of e.g. 50px)
  if (contentWidth <= (window.innerWidth - 50)) {
      isScrollable.value = false
      repeatCount.value = 1
  } else {
      isScrollable.value = true
      // Calculate repeat count based on real width
      // We want enough copies to fill screen + 1 buffer
      // contentWidth already includes the mx-48 (gap) because we mirror the structure
      const itemsPerScreen = Math.ceil(window.innerWidth / contentWidth)
      repeatCount.value = Math.min(Math.max(itemsPerScreen * 2, 5), 30)
  }
}

const duration = computed(() => {
  if (!measureRef.value) return 20 // Default fallback
  const contentWidth = measureRef.value.offsetWidth
  const totalContentWidth = contentWidth * repeatCount.value
  const speedPxPerSec = 150 
  return totalContentWidth / speedPxPerSec
})

watch(() => props.text, () => {
  updateMetrics()
})

onMounted(() => {
  updateMetrics()
  window.addEventListener('resize', updateMetrics)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', updateMetrics)
})
</script>

<template>
  <div 
    class="fixed left-0 right-0 z-50 bg-white/90 backdrop-blur-sm text-black overflow-hidden py-4 font-bold tracking-widest"
    :class="[
      position === 'top' ? 'top-0 shadow-lg' : 'bottom-0 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]'
    ]"
  >
    <div class="marquee-container w-full whitespace-nowrap text-center">
      <div 
        class="inline-block text-6xl font-bold tracking-wide uppercase"
        :class="{ 'animate-scroll': isScrollable }"
        :style="isScrollable ? { 
          animationDuration: `${duration}s`,
          animationDelay: '-10s'
        } : {}"
      >
        <span class="mx-48 inline-flex items-center gap-2" v-for="i in repeatCount" :key="i">
            <template v-for="(segment, idx) in parsedContent" :key="idx">
                <Icon 
                    v-if="segment.type === 'icon'" 
                    :name="segment.value" 
                    :class="segment.class"
                />
                <span 
                    v-else 
                    v-html="segment.value" 
                    :class="segment.class"
                ></span>
            </template>
        </span>
      </div>
    </div>
    
    <!-- Hidden Measure Element -->
    <div class="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none invisible whitespace-nowrap">
       <div ref="measureRef" class="inline-block text-6xl font-bold tracking-wide uppercase">
          <span class="mx-48 inline-flex items-center gap-2">
            <template v-for="(segment, idx) in parsedContent" :key="idx">
                <Icon 
                    v-if="segment.type === 'icon'" 
                    :name="segment.value" 
                    :class="segment.class"
                />
                <span 
                    v-else 
                    v-html="segment.value" 
                    :class="segment.class"
                ></span>
            </template>
          </span>
       </div>
    </div>
  </div>
</template>

<style scoped>
.marquee-container {
  overflow: hidden;
}

.animate-scroll {
  animation: scroll linear infinite;
}

@keyframes scroll {
  0% {
    transform: translateX(100vw);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>
