<template>
  <div class="w-full px-4 sm:px-6 py-6 pb-20">
    <!-- Header Section con búsqueda -->
    <section class="mb-10 relative">
      <!-- Hero Banner con gradiente -->
      <div class="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl py-8 px-6 text-white shadow-md overflow-hidden relative">
        <div class="absolute inset-0 bg-grid-white/[0.2] [mask-image:linear-gradient(0deg,#fff,rgba(255,255,255,0.6))] pointer-events-none"></div>
        
        <div class="relative z-10 max-w-3xl mx-auto text-center">
          <h1 class="text-3xl sm:text-4xl font-bold mb-3">Centro de Ayuda del Himnario</h1>
          <p class="text-base sm:text-lg text-blue-50 mb-6 max-w-2xl mx-auto">
            Todo lo que necesitas saber para aprovechar al máximo todas las funciones del himnario digital.
          </p>
          
          <!-- Buscador de temas -->
          <div class="relative max-w-xl mx-auto mt-6">
            <Input
              v-model="searchQuery"
              type="text"
              placeholder="Buscar guías, consejos o temas..."
              class="w-full pl-12 pr-4 py-3 h-12 shadow-lg bg-white/90 backdrop-blur-sm text-black border-blue-200 focus:border-blue-300"
            />
            <div class="absolute inset-y-0 left-0 flex items-center pl-4">
              <Icon name="tabler:search" class="size-5 text-blue-500"/>
            </div>
          </div>

          <p v-if="searchQuery.length > 0" class="text-sm text-blue-100 mt-2">
            {{ totalMatches.matches }} {{ totalMatches.matches === 1 ? 'resultado' : 'resultados' }} en {{ totalMatches.documents }}
            {{ totalMatches.documents === 1 ? 'publicación' : 'publicaciones' }}.
          </p>
        </div>
      </div>
    </section>
    
    <!-- Resultados de búsqueda (solo se muestra cuando hay búsqueda) -->
    <section v-if="searchQuery.length > 0" class="mb-10 max-w-6xl mx-auto">
      <div class="bg-white rounded-lg border shadow-sm p-4 mb-4">
        <h2 class="text-lg font-semibold flex items-center">
          <Icon name="tabler:search" class="mr-2 text-blue-500" />
          Resultados de búsqueda
        </h2>
      </div>
      
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <template v-for="post in filteredSearchResults" :key="post.id">
          <Card 
            class="hover:shadow-md transition-all duration-200 border-t-4"
            :class="getCardClass(post.tags)"
          >
            <NuxtLink :to="`/ayuda/${post.id}`" class="no-underline block h-full">
              <CardHeader>
                <CardTitle class="text-lg">
                  <div class="flex items-start gap-2">
                    <Icon :name="getIconByTag(post.tags)" class="size-5 mt-0.5" />
                    <Highlighter :query="searchQuery">{{ post.title }}</Highlighter>
                  </div>
                </CardTitle>
                <CardDescription class="flex flex-wrap gap-1">
                  <template v-for="tag in post.tags.split(', ')" :key="tag">
                    <Badge variant="secondary" class="text-xs">{{ tag }}</Badge>
                  </template>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div class="line-clamp-3 text-sm text-muted-foreground">
                  <Highlighter 
                    :query="searchQuery" 
                    :textToHighlight="mdToText(post.content)" 
                    :splitBySpace="true"
                    @matches="(e) => e.length > 0 ? handleMatches(post.id, e) : null"
                  >
                  </Highlighter>
                </div>
              </CardContent>
            </NuxtLink>
          </Card>
        </template>
        <p v-if="filteredSearchResults.length === 0" class="col-span-full text-center text-muted-foreground py-8">
          No se encontraron resultados para tu búsqueda.
        </p>
      </div>
    </section>
    
    <!-- Contenido principal (solo se muestra cuando no hay búsqueda) -->
    <template v-if="searchQuery.length === 0">
      <!-- Sección de Artículos Destacados -->
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold mb-1 pl-2 border-l-4 border-blue-500">
            Artículos destacados
          </h2>
        </div>
        
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <template v-for="article in featuredArticles" :key="article.id">
            <NuxtLink 
              :to="`/ayuda/${article.id}`"
              class="bg-white rounded-lg border shadow-sm p-5 hover:shadow-md transition-all duration-200 no-underline group"
            >
              <div class="flex items-center gap-3 mb-3">
                <div :class="`p-2 rounded-md ${getCardClass(article.tags).replace('border', 'bg').replace('500', '100')}`">
                  <Icon :name="getIconByTag(article.tags)" class="size-6" :class="getCardClass(article.tags).replace('border', 'text').replace('500', '600')" />
                </div>
                <h3 class="font-medium text-gray-800 group-hover:text-blue-600 transition-colors">{{ article.title }}</h3>
              </div>
              <p class="text-sm text-gray-600 line-clamp-2">
                {{ getContentSummary(article.content) }}
              </p>
            </NuxtLink>
          </template>
        </div>
      </section>
      
      <!-- Navegación por Categorías -->
      <section class="mb-10">
        <h2 class="text-xl font-semibold mb-4 pl-2 border-l-4 border-purple-500">
          Categorías de ayuda
        </h2>
        
        <div class="grid gap-4 sm:grid-cols-3">
          <template v-for="(category, key) in categorizedPosts" :key="key">
            <div :class="`bg-${category.color}-50 rounded-lg p-4 flex flex-col`">
              <div class="flex items-center gap-3 mb-3">
                <div :class="`bg-${category.color}-100 p-3 rounded-full`">
                  <Icon :name="category.icon" :class="`size-6 text-${category.color}-600`" />
                </div>
                <h3 class="font-semibold text-lg">{{ category.title }}</h3>
              </div>
              <p class="text-sm text-muted-foreground mb-4">
                {{ category.posts.length }} artículo{{ category.posts.length !== 1 ? 's' : '' }} sobre este tema
              </p>
              <ul class="space-y-1 text-sm">
                <template v-for="post in category.posts.slice(0, 3)" :key="post.id">
                  <li>
                    <NuxtLink :to="`/ayuda/${post.id}`" class="flex items-start hover:text-blue-600 text-gray-700">
                      <Icon name="tabler:file-text" class="size-4 mr-2 mt-0.5 shrink-0" />
                      <span>{{ post.title }}</span>
                    </NuxtLink>
                  </li>
                </template>
                <li v-if="category.posts.length > 3" class="mt-2">
                  <span class="text-xs text-muted-foreground">Y {{ category.posts.length - 3 }} artículo{{ category.posts.length - 3 !== 1 ? 's' : '' }} más</span>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </section>
      
      <!-- Listado completo de documentos -->
      <section class="mb-10">
        <h2 class="text-xl font-semibold mb-4 pl-2 border-l-4 border-amber-500">
          Todos los documentos
        </h2>
        
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <template v-for="post in posts" :key="post.id">
            <ClientOnly>
              <Card
                class="hover:shadow-md transition-all duration-200 border-t-4"
                :class="getCardClass(post.tags)"
              >
                <NuxtLink :to="`/ayuda/${post.id}`" class="no-underline block h-full">
                  <CardHeader>
                    <CardTitle class="text-lg">
                      <div class="flex items-start gap-2">
                        <Icon :name="getIconByTag(post.tags)" class="size-5 mt-0.5" />
                        <span>{{ post.title }}</span>
                      </div>
                    </CardTitle>
                    <CardDescription class="flex flex-wrap gap-1">
                      <template v-for="tag in post.tags.split(', ')" :key="tag">
                        <Badge variant="secondary" class="text-xs">{{ tag }}</Badge>
                      </template>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div class="line-clamp-3 text-sm text-muted-foreground">
                      {{ getContentSummary(post.content, 150) }}
                    </div>
                  </CardContent>
                </NuxtLink>
              </Card>
            </ClientOnly>
          </template>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Highlighter from 'vue-word-highlighter'
import mdToText from "markdown-to-text";

// Definir el layout para la página
definePageMeta({
  layout: 'wiki'
});

// Usar la API para obtener posts
const { data: posts, refresh: refreshPosts } = await useAsyncData(
  'help-posts',
  () => $fetch('/api/ayuda/posts')
);

const searchQuery = ref('')
const matches = ref([])
const change = ref(true)
const totalMatches = computed(() => ({
  documents: matches.value.length,
  matches: matches.value.map(m => m.ms.length).reduce((a, b) => a + b, 0),
}))

// Filtrar los resultados de búsqueda para evitar problemas de hidratación
const filteredSearchResults = computed(() => {
  if (!posts.value || !searchQuery.value) return [];
  
  return posts.value.filter(post => {
    return matches.value.some(m => m.id === post.id);
  });
});

// Manejar coincidencias de búsqueda
function handleMatches(id, matchesArray) {
  if (matchesArray.length > 0) {
    // Evitar duplicados
    if (!matches.value.some(m => m.id === id)) {
      matches.value.push({ id, ms: matchesArray });
    }
  }
}

// Obtener resumen del contenido de manera segura
function getContentSummary(content, maxLength = 100) {
  if (!content) return '';
  
  const text = mdToText(content);
  const paragraphs = text.split('\n\n');
  
  if (paragraphs.length > 1 && paragraphs[1]) {
    return paragraphs[1].length > maxLength 
      ? paragraphs[1].substring(0, maxLength) + '...'
      : paragraphs[1];
  }
  
  return text.length > maxLength 
    ? text.substring(0, maxLength) + '...' 
    : text;
}

// Artículos destacados basados en categorías importantes
const featuredArticles = computed(() => {
  if (!posts.value) return [];
  
  // Definir un artículo destacado por categoría
  const featured = {
    'inicio': posts.value.find(p => p.id === 'inicio-rapido'),
    'visor': posts.value.find(p => p.id === 'visor'),
    'atajos': posts.value.find(p => p.id === 'atajos-teclado'),
    'admin': posts.value.find(p => p.id === 'administrar-himnos')
  };
  
  return Object.values(featured).filter(Boolean);
});

// Agrupar posts por categoría para mostrarlos organizados
const categorizedPosts = computed(() => {
  if (!posts.value) return {};
  
  const categories = {
    'básicos': {
      title: 'Primeros pasos',
      icon: 'tabler:rocket',
      color: 'green',
      posts: []
    },
    'visualización': {
      title: 'Visualización',
      icon: 'tabler:slideshow',
      color: 'blue',
      posts: []
    },
    'productividad': {
      title: 'Productividad',
      icon: 'tabler:keyboard',
      color: 'purple',
      posts: []
    },
    'administración': {
      title: 'Administración',
      icon: 'tabler:file-pencil',
      color: 'amber',
      posts: []
    },
    'técnico': {
      title: 'Técnico',
      icon: 'tabler:device-laptop',
      color: 'gray',
      posts: []
    }
  };
  
  posts.value.forEach(post => {
    const tags = post.tags.split(', ');
    
    if (tags.includes('básico') || tags.includes('primeros pasos')) {
      categories.básicos.posts.push(post);
    } else if (tags.includes('proyección') || tags.includes('visual')) {
      categories.visualización.posts.push(post);
    } else if (tags.includes('productividad') || tags.includes('uso')) {
      categories.productividad.posts.push(post);
    } else if (tags.includes('gestión') || tags.includes('edición')) {
      categories.administración.posts.push(post);
    } else if (tags.includes('dispositivos') || tags.includes('técnico')) {
      categories.técnico.posts.push(post);
    }
  });
  
  // Filtrar categorías vacías
  return Object.entries(categories)
    .filter(([_, category]) => category.posts.length > 0)
    .reduce((acc, [key, category]) => {
      acc[key] = category;
      return acc;
    }, {});
});

// Función para obtener el color de la tarjeta basado en las etiquetas
function getCardClass(tags) {
  if (tags.includes('básico') || tags.includes('primeros pasos')) {
    return 'border-green-500';
  } else if (tags.includes('proyección') || tags.includes('visual')) {
    return 'border-blue-500';
  } else if (tags.includes('productividad') || tags.includes('uso')) {
    return 'border-purple-500';
  } else if (tags.includes('gestión') || tags.includes('edición')) {
    return 'border-amber-500';
  } else if (tags.includes('dispositivos') || tags.includes('técnico')) {
    return 'border-gray-500';
  } else {
    return 'border-indigo-500';
  }
}

// Función para obtener un icono basado en las etiquetas
function getIconByTag(tags) {
  if (tags.includes('básico') || tags.includes('primeros pasos')) {
    return 'tabler:rocket';
  } else if (tags.includes('proyección') || tags.includes('visual')) {
    return 'tabler:slideshow';
  } else if (tags.includes('productividad') || tags.includes('uso')) {
    return 'tabler:keyboard';
  } else if (tags.includes('gestión') || tags.includes('edición')) {
    return 'tabler:file-pencil';
  } else if (tags.includes('dispositivos') || tags.includes('técnico')) {
    return 'tabler:device-laptop';
  } else if (tags.includes('organización')) {
    return 'tabler:list-check';
  } else {
    return 'tabler:help-circle';
  }
}

watch(searchQuery, () => {
  if (change.value) matches.value = []
})
</script>

<style scoped>
.card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-content {
  flex: 1;
}

/* Fondo de patrón grid para el hero */
.bg-grid-white {
  background-size: 30px 30px;
  background-image: 
    linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px);
}
</style>