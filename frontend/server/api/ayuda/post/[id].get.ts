import fs from 'fs'
import path from 'path'

// Cambiar a export default para que funcione correctamente en Nitro
export default defineEventHandler(async (event) => {
  try {
    // Obtener el ID del post de los parámetros de la URL
    const id = getRouterParam(event, 'id')
    
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Se requiere un ID de post',
      })
    }
    
    // Ruta al archivo JSON
    const jsonPath = path.resolve(process.cwd(), 'public', 'posts.json')
    
    // Leer el archivo JSON
    const jsonData = fs.readFileSync(jsonPath, 'utf-8')
    
    // Parsear los datos
    const posts = JSON.parse(jsonData)
    
    // Buscar el post por ID
    const post = posts.find((post: any) => post.id === id)
    
    if (!post) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Post no encontrado',
      })
    }
    
    // Devolver el post
    return post
  } catch (error) {
    console.error('Error al obtener el post:', error)
    
    // Determinar si el error ya ha sido procesado
    if ((error as any).statusCode) {
      throw error
    }
    
    // Manejar otros errores
    throw createError({
      statusCode: 500,
      statusMessage: 'Error al cargar el post',
    })
  }
}) 