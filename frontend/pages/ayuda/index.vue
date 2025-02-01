<template>
  <main class="px-6 pt-2 pb-16 max-w-4xl mx-auto">
    <section class="mb-6">
      <div class="text-center">
        <h1 class="text-4xl font-bold">Ayuda</h1>
        <p class="text-lg text-muted-foreground">
          Encuentra información útil y recomendaciones para aprovechar al máximo este proyecto.
        </p>
        <div class="relative w-full items-center mb-2">
          <Input
              v-model="searchQuery"
              type="text"
              class="mt-4 sm:max-w-[70svw] w-full px-4 py-2 border rounded"
          />
          <span class="absolute start-0 inset-y-0 flex items-center justify-center pl-4">
          <Icon name="tabler:search" class="size-4 text-muted-foreground"/>
            <span>
              Buscar pregunta
            </span>
      </span>
        </div>
      </div>
      <p v-if="searchQuery.length > 0" class="text-center text-sm text-muted-foreground mt-2">
        {{ totalMatches.matches }} {{ totalMatches.matches.length > 1 ? 'resultados' : 'resultado' }} en {{ totalMatches.documents }}
        {{ totalMatches.documents.length > 1 ? 'publicaciones' : 'publicación' }}.
      </p>
    </section>
    <section class="grid gap-4 sm:grid-cols-2 sm:max-h-[50svh] sm:h-[50svh] overflow-y-auto px-2 sm:max-w-[70svw] w-full mx-auto">
      <Card v-for="result in posts" :key="result.item.id"
            v-show="searchQuery.length < 1 || matches.filter(m => m.id === result.item.id).length > 0">
        <NuxtLink :to="`/ayuda/${result.item.id}`" class="no-underline">
          <CardHeader>
            <CardTitle>
              <Highlighter :query="searchQuery">{{ result.item.title }}</Highlighter>
            </CardTitle>
            <CardDescription class="flex gap-1">
              <Badge v-for="tag in result.item.tags.split(', ')" :key="tag" variant="destructive">{{ tag }}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="line-clamp-3">
              <Highlighter :query="searchQuery" :textToHighlight="mdToText(result.item.content)" :splitBySpace="true"
                           @matches="(e) => e.length > 0 ? matches.push({ id: result.item.id, ms: e }) : ''"
                           class="text-sm text-muted-foreground">
              </Highlighter>
            </div>
          </CardContent>
        </NuxtLink>
      </Card>
      <p v-if="posts.length === 0 && searchQuery" class="col-span-full text-center text-muted-foreground">
        No se encontraron resultados.
      </p>
    </section>
  </main>
</template>

<script setup>
import jsonPosts from '~/public/posts.json'
import {Card, CardHeader, CardTitle, CardContent} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import Highlighter from 'vue-word-highlighter'
import mdToText from "markdown-to-text";

const searchQuery = ref('')
const posts = ref([])
const searching = ref(false)
const matches = ref([])
const change = ref(true)
const totalMatches = ref({
  documents: computed(() => matches.value.length),
  matches: computed(() => matches.value.map(m => m.ms.length).reduce((a, b) => a + b, 0)),
})

onMounted(() => {
  posts.value = jsonPosts.map((post) => ({item: post}))
})
watch(searchQuery, () => {
  change.value ? matches.value = [] : null
})
</script>