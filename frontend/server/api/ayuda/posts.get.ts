import fs from 'fs'
import path from 'path'

// Cambiar a export default para que funcione correctamente en Nitro
export default defineEventHandler(async (event) => {
  try {
    // Ruta al archivo JSON
    const jsonPath = path.resolve(process.cwd(), 'public', 'posts.json')
    
    // Leer el archivo JSON
    const jsonData = fs.readFileSync(jsonPath, 'utf-8')
    
    // Parsear los datos
    const posts = JSON.parse(jsonData)
    
    // Devolver los posts
    return posts
  } catch (error) {
    console.error('Error al obtener los posts:', error)
    
    // Manejar el error
    throw createError({
      statusCode: 500,
      statusMessage: 'Error al cargar los posts',
    })
  }
}) 