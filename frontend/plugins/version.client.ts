export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const hash = config.public.commitHash as string
  console.log(`[hymns] commit: ${hash}`)
})
