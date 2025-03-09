<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
const items = [
  {title: "Inicio", value: "/", icon: "mdi-home"},
  {title: "Lista", value: "/lista", icon: "mdi-format-list-bulleted"},
  {title: "Visor", value: "/ver", icon: "mdi-eye"},
  {title: "Ayuda", value: "/ayuda", icon: "mdi-help-circle-outline"},
];
const group = ref(null);
const currentRoute = useRoute().path;
const colorMode = useColorMode()

const toggleTheme = () => {
  colorMode.preference = colorMode.preference === "dark" ? "light" : "dark";
};

onMounted(() => {
  const currentTitle = computed(() => items.find((item) => item.value === useRoute().path)?.title ?? "Inicio");
  useHead({
    htmlAttrs: {lang: "es"},
    titleTemplate: currentTitle,
  });
});

</script>
<template>
  <div class="flex flex-col h-screen">
    <header class="bg-gray-50 border-b shadow-sm z-50 sticky top-0 mb-4">
      <div class="px-6 !py-4 flex items-center justify-between">
        <NuxtLink to="/" :external="false"
                  class="flex items-center gap-2 select-none cursor-pointer hover:bg-muted hover:shadow-md transition-all ease-in-out p-2 rounded-lg">
          <img src="/favicon.ico" alt="Logo" class="size-6 rounded-full"/>
          <h1 class="text-lg font-bold text-gray-800">Himnario</h1>
        </NuxtLink>
        <nav class="flex gap-2">
          <a
              v-for="item in items"
              :key="item.value"
              :href="item.value"
              class="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all route-link-el"
              :class="{
              'bg-blue-100 text-blue-600': currentRoute === item.value,
              'text-gray-700 hover:bg-gray-100': currentRoute !== item.value
            }"
          >
            <Icon :name="item.icon" class="size-4"/>
            <span>{{ item.title }}</span>
          </a>
        </nav>
      </div>
      <NuxtLoadingIndicator :height="2" :duration="300" :color="'#000'"/>
    </header>
    <Toaster position="bottom-right"/>
    <slot/>
  </div>
</template>
<style>
.route-link-el:not(.bg-blue-100) {
  @apply opacity-50;

  &:hover {
    @apply opacity-80;
  }
}
</style>