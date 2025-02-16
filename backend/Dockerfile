# Usa una imagen base con Bun instalado
FROM oven/bun:latest as base

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de configuración del proyecto
COPY package.json  ./

# Instala las dependencias
RUN bun install

# Copia el resto de los archivos del proyecto
COPY . .

# Expone el puerto en el que la aplicación escucha
EXPOSE 5001

# Comando para ejecutar la aplicación
CMD ["bun", "run", "start"]
