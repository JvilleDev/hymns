# Usa una imagen base con Bun instalado
FROM oven/bun:latest as base

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de configuración del proyecto
COPY package.json bun.lock ./

# Instala las dependencias
RUN bun install

# Copia el resto de los archivos del proyecto
COPY . .

# Compila el proyecto Nuxt
RUN bun run build

# Expone el puerto en el que la aplicación escucha (ajusta el puerto si es necesario)
EXPOSE 3000

# Comando para ejecutar el servidor Nuxt
CMD ["bun", "run", "./server/index.mjs"]
