<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'

interface Post {
  id: string;
  title: string;
  tags: string;
  content: string;
}

interface CategoryData {
  title: string;
  icon: string;
  posts: Post[];
}

interface Categories {
  [key: string]: CategoryData;
}

// API para obtener posts
const { data: wikiPosts, refresh: refreshWikiPosts } = await useAsyncData<Post[]>(
  'wiki-posts',
  () => $fetch('/api/ayuda/posts')
)

const route = useRoute();

// Agrupar posts por categoría basada en las etiquetas
const postsByCategory = computed<Categories>(() => {
  if (!wikiPosts.value) return {};
  
  const categories: Categories = {
    básicos: {
      title: "Primeros pasos",
      icon: "tabler:rocket",
      posts: []
    },
    visualización: {
      title: "Visualización",
      icon: "tabler:slideshow",
      posts: []
    },
    productividad: {
      title: "Productividad",
      icon: "tabler:keyboard",
      posts: []
    },
    administración: {
      title: "Administración",
      icon: "tabler:file-pencil",
      posts: []
    },
    técnico: {
      title: "Técnico",
      icon: "tabler:device-laptop",
      posts: []
    },
    otros: {
      title: "Otros temas",
      icon: "tabler:help-circle",
      posts: []
    }
  };
  
  wikiPosts.value.forEach(post => {
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
    } else {
      categories.otros.posts.push(post);
    }
  });
  
  // Eliminar categorías vacías
  Object.keys(categories).forEach(key => {
    if (categories[key].posts.length === 0) {
      delete categories[key];
    }
  });
  
  return categories;
});

// Estado para el menú lateral en móvil
const isSidebarOpen = ref(false);

// Cerrar sidebar al cambiar de ruta (para móvil)
watch(() => route.path, () => {
  isSidebarOpen.value = false;
});
</script>

<template>
  <div class="flex flex-col min-h-screen bg-gray-50">
    <!-- Barra superior -->
    <header class="bg-background/95 backdrop-blur-md border-b shadow-sm z-50 sticky top-0">
      <div class="px-5 py-2 flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-4">
          <!-- Botón hamburguesa para móvil -->
          <Button variant="ghost" size="sm" class="md:hidden" @click="isSidebarOpen = !isSidebarOpen">
            <Icon name="tabler:menu-2" class="size-5" />
          </Button>
          
          <!-- Logo y nombre -->
          <NuxtLink to="/" class="flex items-center gap-2 select-none hover:bg-blue-50/50 transition-all ease-in-out p-2 rounded-md">
            <img src="/favicon.ico" alt="Logo" class="size-5 rounded-full"/>
            <h1 class="text-base font-bold text-blue-700">Himnario</h1>
          </NuxtLink>
          
          <!-- Breadcrumb -->
          <div class="flex items-center gap-1 text-sm">
            <Icon name="tabler:chevron-right" class="size-4 text-gray-400" />
            <NuxtLink to="/ayuda" class="text-gray-600 hover:text-blue-600">Ayuda</NuxtLink>
            
            <template v-if="route.params.id">
              <Icon name="tabler:chevron-right" class="size-4 text-gray-400" />
              <span class="text-gray-600 truncate max-w-[150px]">{{ route.params.id }}</span>
            </template>
          </div>
        </div>
        
        <!-- Botón para volver a inicio -->
        <NuxtLink to="/" class="flex items-center gap-2 text-sm text-blue-600 font-medium hover:bg-blue-50 px-3 py-1.5 rounded-md transition-all">
          <Icon name="tabler:home" class="size-4" />
          <span class="hidden sm:inline">Volver al inicio</span>
        </NuxtLink>
      </div>
      <NuxtLoadingIndicator :height="2" :duration="300" :color="'#3b82f6'"/>
    </header>
    
    <!-- Contenido con sidebar -->
    <div class="flex flex-1 relative">
      <!-- Sidebar para móvil (overlay) -->
      <div 
        v-if="isSidebarOpen" 
        class="fixed inset-0 bg-black/50 z-40 md:hidden"
        @click="isSidebarOpen = false">
      </div>
      
      <!-- Sidebar wiki -->
      <aside 
        class="bg-white border-r w-72 shrink-0 overflow-y-auto fixed md:sticky top-[53px] bottom-0 z-40 transition-all duration-300"
        :class="isSidebarOpen ? 'left-0' : '-left-72 md:left-0'"
        style="height: calc(100vh - 53px);">
        
        <div class="p-4">
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-gray-800 mb-1">Centro de Ayuda</h2>
            <p class="text-sm text-gray-500">Guías y tutoriales</p>
          </div>
          
          <!-- Navegación por categorías -->
          <nav class="space-y-6">
            <div v-for="(category, key) in postsByCategory" :key="key" class="space-y-1">
              <h3 class="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2 flex items-center">
                <Icon :name="category.icon" class="size-3.5 mr-1" />
                {{ category.title }}
              </h3>
              
              <ul class="space-y-1 ml-1">
                <li v-for="post in category.posts" :key="post.id">
                  <NuxtLink 
                    :to="`/ayuda/${post.id}`" 
                    class="block py-1 px-3 text-sm rounded-md transition-colors"
                    :class="route.params.id === post.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'">
                    {{ post.title }}
                  </NuxtLink>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </aside>
      
      <!-- Contenido principal -->
      <main class="flex-1 min-w-0 pt-2">
        <slot />
      </main>
    </div>
    
    <Toaster position="bottom-right"/>
  </div>
</template> 