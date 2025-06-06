<script setup>
import { useRoute, useRouter } from 'vue-router'

// Define la página de ayuda usando el layout wiki
definePageMeta({
  layout: 'wiki'
})

const route = useRoute()
const router = useRouter()
const postId = route.params.id

// Obtener el post actual y todos los posts a través de la API
const { data: post } = await useAsyncData(
  `post-${postId}`,
  () => $fetch(`/api/ayuda/post/${postId}`)
)

const { data: posts } = await useAsyncData(
  'posts',
  () => $fetch('/api/ayuda/posts')
)

// Calcular el índice actual, post anterior y post siguiente
const currentIndex = computed(() => {
  if (!posts.value) return -1
  return posts.value.findIndex(p => p.id === postId)
})

const prevPost = computed(() => {
  if (currentIndex.value > 0) {
    return posts.value[currentIndex.value - 1]
  }
  return null
})

const nextPost = computed(() => {
  if (currentIndex.value < posts.value?.length - 1 && currentIndex.value !== -1) {
    return posts.value[currentIndex.value + 1]
  }
  return null
})

// Extraer los encabezados del contenido markdown para formar la tabla de contenidos
const headers = computed(() => {
  if (!post.value?.content) return []
  
  const regex = /#{1,3} (.+)/g
  const matches = [...post.value.content.matchAll(regex)]
  
  return matches.map(match => {
    const level = match[0].indexOf(' ')
    const text = match[1]
    const id = text.toLowerCase().replace(/[^\w]+/g, '-')
    return { level, text, id }
  })
})

// Función para navegar entre artículos
function navigateTo(targetId) {
  router.push(`/ayuda/${targetId}`)
}

// Estado para la sección activa durante el scroll
const activeSection = ref('')

// Función para desplazarse a un encabezado específico
function scrollToHeader(id) {
  // Actualizar la sección activa
  activeSection.value = id
  
  // Actualizar la URL con el anchor sin hacer navegación completa
  window.history.pushState({}, '', `${route.path}#${id}`)
  
  // Scroll suave al elemento
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
  }
}

// Inicializar la sección activa del hash de la URL
onMounted(() => {
  // Comprobar si hay un hash en la URL al cargar
  if (import.meta.client && window.location.hash) {
    const hash = window.location.hash.substring(1)
    activeSection.value = hash
    
    // Desplazarse después de un pequeño retraso para permitir la renderización
    setTimeout(() => {
      const el = document.getElementById(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'auto' })
      }
    }, 300)
  } else if (headers.value.length > 0) {
    // Si no hay hash, establecer el primer encabezado como activo
    activeSection.value = headers.value[0].id
  }
  
  // Configurar el observador de intersección para detectar secciones visibles
  setupIntersectionObserver()
})

// Configurar IntersectionObserver para detectar la sección visible
function setupIntersectionObserver() {
  setTimeout(() => {
    const articleElement = document.querySelector('article.post')
    if (!articleElement) return
    
    const headings = articleElement.querySelectorAll('h2, h3')
    if (headings.length === 0) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        // Filtrar entradas que están intersectando
        const visibleEntries = entries
          .filter(entry => entry.isIntersecting)
          // Ordenar por posición (Y) para obtener el más cercano al inicio
          .sort((a, b) => a.boundingClientRect.y - b.boundingClientRect.y)
        
        if (visibleEntries.length > 0) {
          const visibleEntry = visibleEntries[0]
          const id = visibleEntry.target.id
          
          // Solo actualizar si es diferente para evitar recalculos innecesarios
          if (activeSection.value !== id) {
            activeSection.value = id
            // Actualizar URL sin recargar
            window.history.replaceState({}, '', `${route.path}#${id}`)
          }
        }
      },
      {
        // Opciones ajustadas para mejor detección
        rootMargin: '-80px 0px -70% 0px',
        threshold: [0, 0.1, 0.5, 1]
      }
    )
    
    // Observar todos los encabezados
    headings.forEach(heading => {
      if (heading.id) {
        observer.observe(heading)
      }
    })
    
    // Limpiar al desmontar
    onBeforeUnmount(() => {
      observer.disconnect()
    })
  }, 500)
}

// Obtener posts relacionados basados en etiquetas compartidas
const relatedPosts = computed(() => {
  if (!post.value || !posts.value) return []
  
  const currentTags = post.value.tags.split(', ')
  
  // Excluir el post actual y calcular la relevancia basada en etiquetas compartidas
  return posts.value
    .filter(p => p.id !== postId)
    .map(p => {
      const tags = p.tags.split(', ')
      const sharedTags = currentTags.filter(tag => tags.includes(tag))
      return {
        ...p,
        relevance: sharedTags.length
      }
    })
    .filter(p => p.relevance > 0) // Solo mostrar posts con al menos una etiqueta compartida
    .sort((a, b) => b.relevance - a.relevance) // Ordenar por relevancia
    .slice(0, 3) // Limitar a 3 posts relacionados
})
</script>
<template>
  <div class="px-6 pt-6 pb-16 max-w-6xl mx-auto">
    <div class="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
      <!-- Sidebar con navegación por secciones (solo en desktop grande) -->
      <aside class="hidden lg:block">
        <div class="sticky top-6" style="position: -webkit-sticky; position: sticky;">
          <!-- Tabla de contenido -->
          <div class="mb-6 rounded-lg bg-card p-4 border">
            <h3 class="text-sm font-semibold mb-3">En esta página</h3>
            <nav class="text-sm max-h-[min(calc(100vh-150px),600px)] overflow-y-auto pr-2">
              <ul class="space-y-1.5">
                <li v-for="header in headers" :key="header.id" class="line-clamp-2">
                  <a :href="`#${header.id}`" class="block py-1 text-muted-foreground hover:text-primary transition-colors" 
                  :class="[
                    {'pl-0 font-medium': header.level === 2},
                    {'pl-2': header.level === 3},
                    {'pl-4': header.level === 4},
                    {'pl-6': header.level === 5},
                    {'pl-8': header.level === 6},
                    {'text-primary font-medium': activeSection === header.id}
                  ]">
                    {{ header.text }}
                  </a>
                </li>
              </ul>
            </nav>
          </div>

          <!-- Artículos relacionados -->
          <div v-if="relatedPosts && relatedPosts.length > 0" class="rounded-lg bg-card p-4 border">
            <h3 class="text-sm font-semibold mb-3">Artículos relacionados</h3>
            <ul class="space-y-2 max-h-[min(calc(100vh-300px),400px)] overflow-y-auto">
              <li v-for="post in relatedPosts" :key="post.id" class="line-clamp-2">
                <NuxtLink :to="`/ayuda/${post.id}`" class="text-sm block py-1 text-muted-foreground hover:text-primary transition-colors">
                  {{ post.title }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </aside>
      
      <!-- Contenido principal con navegación lateral -->
      <section class="flex-1 order-first lg:order-last">
        <!-- Grid de 2 columnas para contenido y navegación lateral en md+ -->
        <div class="grid grid-cols-1 md:grid-cols-[1fr_250px] gap-6">
          <!-- Contenido del artículo -->
          <div class="bg-card rounded-lg border shadow-sm p-6 sm:p-8">
            <!-- Cabecera del artículo -->
            <header class="mb-6 pb-4 border-b">
              <div class="flex flex-wrap gap-2 mb-2">
                <Badge 
                  v-for="tag in post?.tags.split(', ')" 
                  :key="tag" 
                  variant="secondary" 
                  class="text-xs px-2 py-0.5">
                  {{ tag }}
                </Badge>
              </div>
              
              <h1 class="text-2xl sm:text-3xl font-bold mb-2">{{ post?.title }}</h1>
            </header>
            
            <!-- Contenido del artículo -->
            <MDC tag="article" class="post prose prose-neutral max-w-none" :value="post?.content" />
            
            <!-- Botones de navegación entre artículos al final del contenido -->
            <div class="mt-12 pt-8 border-t border-border">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Botón de artículo anterior -->
                <div v-if="prevPost" class="flex flex-col gap-1">
                  <span class="text-xs uppercase text-muted-foreground">Anterior</span>
                  <NuxtLink 
                    :to="`/ayuda/${prevPost.id}`" 
                    class="group flex items-center gap-2 hover:underline"
                  >
                    <Icon name="tabler:chevron-left" class="size-4 text-foreground/70 group-hover:text-primary" />
                    <span class="font-medium text-sm md:text-base">{{ prevPost.title }}</span>
                  </NuxtLink>
                </div>
                <div v-else class="flex-1"></div>
                
                <!-- Botón de artículo siguiente -->
                <div v-if="nextPost" class="flex flex-col gap-1 md:text-right">
                  <span class="text-xs uppercase text-muted-foreground">Siguiente</span>
                  <NuxtLink 
                    :to="`/ayuda/${nextPost.id}`" 
                    class="group flex items-center md:justify-end gap-2 hover:underline"
                  >
                    <span class="font-medium text-sm md:text-base">{{ nextPost.title }}</span>
                    <Icon name="tabler:chevron-right" class="size-4 text-foreground/70 group-hover:text-primary" />
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Navegación lateral derecha (md+) -->
          <div class="hidden md:block lg:hidden space-y-6">
            <div class="sticky top-6" style="position: -webkit-sticky; position: sticky;">
              <!-- Tabla de contenido -->
              <div v-if="headers.length > 2" class="mb-6 rounded-lg bg-card p-4 border">
                <h3 class="text-sm font-semibold mb-3">En esta página</h3>
                <nav class="text-sm max-h-[min(calc(100vh-150px),600px)] overflow-y-auto pr-2">
                  <ul class="space-y-1.5">
                    <li v-for="header in headers" :key="header.id" class="line-clamp-2">
                      <a :href="`#${header.id}`" class="block py-1 text-muted-foreground hover:text-primary transition-colors" 
                      :class="[
                        {'pl-0 font-medium': header.level === 2},
                        {'pl-2': header.level === 3},
                        {'pl-4': header.level === 4},
                        {'pl-6': header.level === 5},
                        {'pl-8': header.level === 6},
                        {'text-primary font-medium': activeSection === header.id}
                      ]">
                        {{ header.text }}
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>
              
              <!-- Artículos relacionados -->
              <div v-if="relatedPosts && relatedPosts.length > 0" class="rounded-lg bg-card p-4 border">
                <h3 class="text-sm font-semibold mb-3">Artículos relacionados</h3>
                <ul class="space-y-2 max-h-[min(calc(100vh-300px),400px)] overflow-y-auto">
                  <li v-for="post in relatedPosts" :key="post.id" class="line-clamp-2">
                    <NuxtLink :to="`/ayuda/${post.id}`" class="text-sm block py-1 text-muted-foreground hover:text-primary transition-colors">
                      {{ post.title }}
                    </NuxtLink>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
          
        <!-- Navegación para móvil (solo sm) -->
        <div class="md:hidden space-y-6 mt-6">
          <!-- Tabla de contenidos móvil -->
          <div v-if="headers.length > 2" class="bg-card p-4 rounded-lg border">
            <div class="font-medium mb-3 flex items-center gap-2">
              <Icon name="tabler:list" class="size-4" />
              <span>En esta página:</span>
            </div>
            <ul class="space-y-2">
              <li 
                v-for="header in headers" 
                :key="header.id"
                class="cursor-pointer hover:text-primary"
                :class="{ 
                  'ml-4 text-sm': header.level === 3,
                  'font-medium': header.level === 2,
                  'text-primary font-medium': activeSection === header.id 
                }"
                @click="scrollToHeader(header.id)">
                {{ header.text }}
              </li>
            </ul>
          </div>
          
          <!-- Artículos relacionados móvil -->
          <div v-if="relatedPosts && relatedPosts.length > 0" class="bg-card p-4 rounded-lg border">
            <div class="font-medium mb-3 flex items-center gap-2">
              <Icon name="tabler:link" class="size-4" />
              <span>Artículos relacionados:</span>
            </div>
            <ul class="space-y-2">
              <li v-for="post in relatedPosts" :key="post.id" class="line-clamp-2">
                <NuxtLink :to="`/ayuda/${post.id}`" class="text-sm block py-1 text-muted-foreground hover:text-primary transition-colors">
                  {{ post.title }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style>
article.post {
  & :is(h2, h3, h4, h5, h6) a {
    @apply text-inherit hover:text-neutral-600 no-underline;
  }

  & h1 {
    @apply text-3xl font-bold text-neutral-900 mt-8 mb-4;
  }

  & h2 {
    @apply text-2xl font-semibold text-neutral-800 mt-8 mb-3 pb-2 border-b border-neutral-200;
    
    &::before {
      content: "";
      display: block;
      height: 80px;
      margin: -80px 0 0;
      visibility: hidden;
      pointer-events: none;
    }
  }

  & h3 {
    @apply text-xl font-medium text-neutral-700 mt-6 mb-2;
    
    &::before {
      content: "";
      display: block;
      height: 80px;
      margin: -80px 0 0;
      visibility: hidden;
      pointer-events: none;
    }
  }

  & h4 {
    @apply text-lg font-medium text-neutral-600 mt-5 mb-2;
  }

  & h5, h6 {
    @apply text-base font-semibold text-neutral-500 mt-4 mb-1;
  }

  & p {
    @apply mb-4 text-base text-neutral-700 leading-relaxed;
  }

  & a {
    @apply text-blue-500 hover:text-blue-700 underline;
  }

  & ul {
    @apply list-disc pl-6 mb-4 space-y-1;
  }

  & ol {
    @apply list-decimal pl-6 mb-4 space-y-1;
  }

  & li {
    @apply mb-1 text-neutral-700;
    & p {
      @apply mb-1;
    }
  }

  /* Bloques de código */
  & pre {
    @apply bg-neutral-800 text-neutral-100 p-4 rounded-lg mb-4 overflow-x-auto text-sm;
    code {
      @apply bg-transparent text-inherit p-0 font-mono;
      white-space: pre;
      border-radius: 0;
    }
  }

  /* Código en línea */
  & :not(pre) > code {
    @apply bg-neutral-100 text-neutral-700 px-1.5 py-0.5 text-[.9rem] rounded font-mono;
    white-space: normal;
    word-wrap: break-word;
  }

  /* Imágenes */
  & img {
    @apply rounded-lg shadow-md my-4 max-w-full;
  }

  /* Citas */
  & blockquote {
    @apply border-l-4 border-blue-500 pl-4 py-2 italic text-neutral-600 mb-4 bg-blue-50 rounded-r-lg;
  }
  
  /* Tablas */
  & table {
    @apply w-full border-collapse mb-4 text-sm;
    
    & th {
      @apply bg-neutral-100 text-neutral-700 p-2 text-left border border-neutral-300 font-medium;
    }
    
    & td {
      @apply p-2 border border-neutral-300 text-neutral-600;
    }
    
    & tr:nth-child(even) {
      @apply bg-neutral-50;
    }
  }
  
  /* Reglas horizontales */
  & hr {
    @apply my-6 border-t border-neutral-200;
  }
  
  /* Estilos adicionales para mejor legibilidad */
  font-feature-settings: 'kern', 'liga', 'calt';
  text-rendering: optimizeLegibility;
}

/* Scrollbar personalizado para mejor experiencia visual */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400;
}
</style> 