import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'

export interface ContentSegment {
  type: 'text' | 'icon'
  value: string
  class?: string
}

export const useContentParser = () => {
  const { icons } = useAnnouncementIcons()

  const parseHTML = (html: string): ContentSegment[] => {
    if (!html) return []
    
    // Auto-inject spans for keywords to ensure they are always styled
    const enrichedHTML = html
      .replace(/WSS:/g, '<span class="text-red-600 font-black">WSS:</span>')
      .replace(/WMB/g, '<span class="text-purple-600 font-black">WMB</span>')

    const segments: ContentSegment[] = []
    
    if (typeof window === 'undefined') return []

    const parser = new DOMParser()
    const doc = parser.parseFromString(enrichedHTML, 'text/html')
    
    const walk = (node: Node, currentStyles: { bold?: boolean, italic?: boolean, color?: string } = {}) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
          const classes = [
            currentStyles.color ? `text-${currentStyles.color}-600` : '',
            currentStyles.bold ? 'font-black' : 'font-bold', 
            currentStyles.italic ? 'italic' : ''
          ].filter(Boolean).join(' ')
          
          segments.push({
            type: 'text',
            value: node.textContent,
            class: classes
          })
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        const newStyles = { ...currentStyles }
        
        if (['STRONG', 'B'].includes(el.tagName)) newStyles.bold = true
        if (['EM', 'I'].includes(el.tagName)) newStyles.italic = true
        
        // Handle custom styles from classes (e.g. from Tiptap marks)
        if (el.classList.contains('text-red-600')) newStyles.color = 'red'
        if (el.classList.contains('text-purple-600')) newStyles.color = 'purple'
        if (el.classList.contains('font-black')) newStyles.bold = true
        if (el.classList.contains('italic')) newStyles.italic = true
        
        // Handle Icons
        if (el.classList.contains('announcement-icon') || el.hasAttribute('data-icon')) {
          const iconName = el.getAttribute('data-icon')
          if (iconName) {
            const iconDef = icons.find(i => i.name === iconName)
            if (iconDef) {
                 let iconColorClass = ''
                 if (iconName === 'david') iconColorClass = 'text-primary'
                 
                 segments.push({
                   type: 'icon',
                   value: iconDef.icon,
                   class: `inline-block align-text-bottom mb-1 size-[1.1em] ${iconColorClass}`
                 })
                 return 
            } else {
               // If icon not found, just walk children
            }
          }
        }
        
        el.childNodes.forEach(child => walk(child, newStyles))
        
        if (el.tagName === 'P') {
          segments.push({ type: 'text', value: ' ', class: '' })
        }
      }
    }
    
    doc.body.childNodes.forEach(child => walk(child))
    return segments
  }

  return {
    parseHTML
  }
}
