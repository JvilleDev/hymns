export default defineNuxtRouteMiddleware((to) => {
  const { setClientId } = useApi();
  const clientIdFromQuery = to.query.clientId as string;

  if (clientIdFromQuery) {
    console.log(`[CLIENT-ID] Found clientId in query: ${clientIdFromQuery}. Updating context.`);
    setClientId(clientIdFromQuery);
  }
});
