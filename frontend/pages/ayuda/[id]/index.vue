<script setup>
import { useRoute } from 'vue-router'
import posts from '~/public/posts.json'

const route = useRoute()
const postId = route.params.id
const post = posts.find((post) => post.id === postId)
</script>
<template>
  <main class="px-6 pt-2 pb-16 sm:w-[70svw] w-full mx-auto flex flex-col items-start justify-start">
    <NuxtLink to="/ayuda" class="sticky top-2 rounded-md w-fit px-4 py-1 text-sm text-blue-600 hover:brightness-95 border-2 border-blue-300 flex items-center gap-2 justify-center bg-blue-200"><Icon name="tabler:arrow-left" class="size-4 mr-2"/> Volver</NuxtLink>
    <section class="mt-4">
      <h1 class="text-3xl font-bold mb-4">{{ post?.title }}</h1>
      <MDC tag="article" class="post" :value="post?.content" />
    </section>
  </main>
</template>
<style>
article.post {
  & :is(h2, h3, h4, h5, h6) a {
    @apply text-inherit hover:text-neutral-600 no-underline;
  }

  & h1 {
    @apply text-4xl font-bold text-neutral-900 mt-6 mb-4;
  }

  & h2 {
    @apply text-3xl font-semibold text-neutral-800 mt-5 mb-3;
  }

  & h3 {
    @apply text-2xl font-medium text-neutral-700 mt-4 mb-2;
  }

  & h4 {
    @apply text-xl font-medium text-neutral-600 mt-3 mb-2;
  }

  & h5, h6 {
    @apply text-lg font-semibold text-neutral-500 mt-2 mb-1;
  }

  & p {
    @apply mb-4 text-base text-neutral-700;
  }

  & a {
    @apply text-blue-500 hover:text-blue-700 underline;
  }

  & ul {
    @apply list-disc pl-6 mb-4;
  }

  & ol {
    @apply list-decimal pl-6 mb-4;
  }

  & li {
    @apply mb-2 text-neutral-700;
  }

  & pre {
    @apply bg-neutral-400 text-white p-4 rounded-lg mb-4 overflow-auto;
  }

  & code {
    @apply bg-neutral-200 text-neutral-600 px-1 py-0.5 text-[.8rem] rounded font-mono;
  }

  /* Imágenes */
  & img {
    @apply rounded-lg shadow-md my-4;
  }

  /* Citas */
  & blockquote {
    @apply border-l-4 border-blue-500 pl-4 italic text-neutral-600 mb-4;
  }
}
</style>