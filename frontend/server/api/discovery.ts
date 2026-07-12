let sharedBackendUrl: string | null = null;

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === 'GET') {
    return { url: sharedBackendUrl };
  }

  if (method === 'POST') {
    const body = await readBody(event);
    if (body.url) {
      sharedBackendUrl = body.url;
      return { success: true, url: sharedBackendUrl };
    }
  }

  return { url: sharedBackendUrl };
});
