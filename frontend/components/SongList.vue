<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import { watch } from 'vue';

type Song = {
  title: string,
  id: string,
  nh: number,
  type: string
  content?: string,
  score?: number
}

const props = defineProps<{
  elements: Song[];
  activeId: string;
  isSearching: boolean;
  searchTerm?: string;
  isLoading?: boolean;
}>();

// Optimizar el cálculo de similitud con memoización
const similarityCache = new Map<string, boolean>();

function getCacheKey(word1: string, word2: string): string {
  return `${word1}:${word2}`;
}

// Función para normalizar texto (quitar acentos, mayúsculas, etc.)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD") // Descomponer caracteres acentuados
    .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
    .replace(/[ñÑ]/g, "n"); // Reemplazar ñ por n
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

// Versión mejorada para detectar si una palabra es similar a un término de búsqueda
function areSimilar(word1: string, word2: string, threshold = 0.35): boolean {
  // Normalizar las palabras
  const normWord1 = normalizeText(word1);
  const normWord2 = normalizeText(word2);
  
  const cacheKey = getCacheKey(normWord1, normWord2);
  if (similarityCache.has(cacheKey)) {
    return similarityCache.get(cacheKey)!;
  }

  // Prevenir coincidencias con letras sueltas si la otra palabra es mucho más larga
  if ((normWord1.length === 1 && normWord2.length > 3) || 
      (normWord2.length === 1 && normWord1.length > 3)) {
    similarityCache.set(cacheKey, false);
    return false;
  }

  // Si ambas son números, usar una lógica especial
  if (!isNaN(Number(normWord1)) && !isNaN(Number(normWord2))) {
    const result = normWord1.includes(normWord2) || normWord2.includes(normWord1);
    similarityCache.set(cacheKey, result);
    return result;
  }
  
  // Comprobar si hay una coincidencia de raíz (una palabra dentro de otra)
  // Solo si la palabra incluida tiene al menos 3 caracteres o más de la mitad de la longitud
  if (normWord1.includes(normWord2) && (normWord2.length >= 3 || normWord2.length >= normWord1.length / 2)) {
    similarityCache.set(cacheKey, true);
    return true;
  }

  if (normWord2.includes(normWord1) && (normWord1.length >= 3 || normWord1.length >= normWord2.length / 2)) {
    similarityCache.set(cacheKey, true);
    return true;
  }
  
  // Búsqueda específica para "oracion" -> "oración"
  if ((normWord1 === "oracion" && normWord2.includes("oraci")) || 
      (normWord2 === "oracion" && normWord1.includes("oraci"))) {
    similarityCache.set(cacheKey, true);
    return true;
  }

  // Búsqueda específica para "accion" -> "acción" 
  if ((normWord1 === "accion" && normWord2.includes("acci")) || 
      (normWord2 === "accion" && normWord1.includes("acci"))) {
    similarityCache.set(cacheKey, true);
    return true;
  }
  
  // Si una de las palabras es muy corta (2-3 caracteres), ser más flexible
  if (normWord1.length <= 3 || normWord2.length <= 3) {
    // Para palabras cortas, comprobamos si es un prefijo/sufijo o si hay pocos errores
    const isPrefix = normWord1.startsWith(normWord2) || normWord2.startsWith(normWord1);
    const isSuffix = normWord1.endsWith(normWord2) || normWord2.endsWith(normWord1);
    if (isPrefix || isSuffix) {
      similarityCache.set(cacheKey, true);
      return true;
    }
    
    // Para palabras cortas, usamos un umbral más bajo para la distancia
    const maxLength = Math.max(normWord1.length, normWord2.length);
    const distance = levenshteinDistance(normWord1, normWord2);
    const result = distance <= 1; // Solo permitir 1 error para palabras cortas
    similarityCache.set(cacheKey, result);
    return result;
  }

  // Comprobar si es un singular/plural simple
  const singularPlural = (normWord1 + 's' === normWord2) || 
                        (normWord2 + 's' === normWord1) ||
                        (normWord1 + 'es' === normWord2) || 
                        (normWord2 + 'es' === normWord1);
  if (singularPlural) {
    similarityCache.set(cacheKey, true);
    return true;
  }

  // Comprobar similitud con Levenshtein
  const distance = levenshteinDistance(normWord1, normWord2);
  const maxLength = Math.max(normWord1.length, normWord2.length);
  
  // Ajustar el umbral basado en la longitud de las palabras
  let adjustedThreshold = threshold;
  if (maxLength >= 8) {
    // Para palabras más largas, ser más permisivo
    adjustedThreshold = Math.min(threshold + 0.1, 0.45);
  }
  
  const result = distance / maxLength <= adjustedThreshold;
  similarityCache.set(cacheKey, result);
  return result;
}

// Cache para el texto resaltado
const highlightCache = new Map<string, string>();

function highlightText(text: string, query: string) {
  if (!query || !text) return text;
  
  const cacheKey = `${text}:${query}`;
  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey)!;
  }
  
  // Casos especiales conocidos
  if (query.toLowerCase() === 'accion' && text.match(/ORACIÓN/i)) {
    const result = text.replace(/(ORACIÓN|oración|Oración)/g, '<mark class="bg-yellow-200/75 rounded-sm px-0.5">$1</mark>');
    highlightCache.set(cacheKey, result);
    return result;
  }
  
  // Palabras específicas que no deberían resaltarse aisladamente
  const singleLetterWords = ['a', 'y', 'o', 'e', 'u', 'A', 'Y', 'O', 'E', 'U'];
  
  const searchWords = query.trim().split(/\s+/).filter(word => word.length > 0);
  
  // Usamos una expresión regular para dividir el texto manteniendo delimitadores
  const regex = /(\s+|[.,;:!?()[\]{}'"¡¿«»""''–—…])/;
  const words = text.split(regex);
  
  const highlightedWords = words.map(word => {
    // Si es un espacio o un signo de puntuación, lo dejamos como está
    if (regex.test(word) || word === '') return word;
    
    // No resaltamos palabras de una sola letra a menos que sean parte de la búsqueda exacta
    if (word.length === 1 && singleLetterWords.includes(word) && !searchWords.includes(word)) {
      return word;
    }
    
    // Comprobamos si la palabra debe ser resaltada
    const shouldHighlight = searchWords.some(searchWord => areSimilar(word, searchWord));
    
    return shouldHighlight
      ? `<mark class="bg-yellow-200/75 rounded-sm px-0.5">${word}</mark>`
      : word;
  });
  
  const result = highlightedWords.join('');
  highlightCache.set(cacheKey, result);
  return result;
}

// Nueva función para limitar el texto pero preservar los marcadores HTML y mostrar el contexto relevante
function truncateText(html: string, maxLength: number = 120): string {
  if (!html || html.length <= maxLength) return html;
  
  // Si no contiene marcas, simplemente truncamos
  if (!html.includes('<mark')) {
    // Truncamiento simple para texto sin marcas
    return html.substring(0, maxLength - 3) + '...';
  }
  
  // Encontrar posiciones de todas las marcas
  const markPositions = [];
  let pos = html.indexOf('<mark');
  while (pos !== -1) {
    markPositions.push(pos);
    pos = html.indexOf('<mark', pos + 1);
  }
  
  if (markPositions.length === 0) {
    return html.substring(0, maxLength - 3) + '...';
  }
  
  // Determinar el centro de interés (promedio de posiciones de marcas)
  let centerOfInterest = 0;
  markPositions.forEach(pos => centerOfInterest += pos);
  centerOfInterest = Math.floor(centerOfInterest / markPositions.length);
  
  // Determinamos el rango a mostrar alrededor del centro de interés
  let startPos = Math.max(0, centerOfInterest - Math.floor(maxLength / 2));
  let endPos = Math.min(html.length, startPos + maxLength);
  
  // Ajustar para no cortar en medio de una etiqueta
  // Retroceder hasta encontrar un espacio seguro
  if (startPos > 0) {
    // Retroceder hasta el inicio si estamos en medio de una etiqueta
    let inTag = false;
    let i = startPos;
    while (i > 0) {
      if (html[i] === '>') {
        inTag = false;
        break;
      }
      if (html[i] === '<') {
        inTag = true;
        break;
      }
      i--;
    }
    
    // Si estamos en una etiqueta, retroceder hasta antes de la etiqueta
    if (inTag) {
      while (i > 0 && html[i] !== '<') i--;
      startPos = i;
    } else {
      // Buscar un espacio o inicio de palabra
      i = startPos;
      while (i > 0 && html[i] !== ' ' && html[i] !== '>') i--;
      startPos = i === 0 ? 0 : i + 1;
    }
  }
  
  // Ajustar el final para no cortar en medio de una etiqueta
  let inTag = false;
  let i = endPos;
  while (i < html.length) {
    if (html[i] === '<') {
      inTag = true;
      break;
    }
    if (html[i] === '>') {
      inTag = false;
      break;
    }
    i++;
  }
  
  // Si estamos en una etiqueta, avanzar hasta después de la etiqueta
  if (inTag) {
    while (i < html.length && html[i] !== '>') i++;
    endPos = i + 1;
  } else {
    // Buscar un espacio o fin de palabra
    i = endPos;
    while (i < html.length && html[i] !== ' ' && html[i] !== '<') i++;
    endPos = i;
  }
  
  // Preparar el resultado
  let result = '';
  
  // Añadir elipsis al inicio si necesario
  if (startPos > 0) {
    result = '... ';
  }
  
  // Extraer la porción relevante
  result += html.substring(startPos, endPos);
  
  // Añadir elipsis al final si necesario
  if (endPos < html.length) {
    result += ' ...';
  }
  
  // Asegurarse de que todas las etiquetas estén cerradas
  const openMarkCount = (result.match(/<mark/g) || []).length;
  const closeMarkCount = (result.match(/<\/mark>/g) || []).length;
  
  if (openMarkCount > closeMarkCount) {
    result += '</mark>'.repeat(openMarkCount - closeMarkCount);
  }
  
  return result;
}

// Limpiar caché cuando cambian las props
watch(() => props.searchTerm, () => {
  highlightCache.clear();
  similarityCache.clear();
});

defineEmits<{
  (e: 'changeSong', id: string): void;
}>();
</script>

<template>
  <div class="song-list-container w-full h-full">
    <div v-if="elements.length > 0 && searchTerm && searchTerm.length > 0" class="px-3 py-2 text-sm text-muted-foreground border-b">
      {{ elements.length }} resultado{{ elements.length !== 1 ? 's' : '' }} para "{{ searchTerm }}"
    </div>
    <ul class="flex flex-col gap-2 p-2 overflow-y-auto h-full" v-auto-animate>
      <li
        v-for="i in elements.length > 0 ? elements : Array(5).fill({})"
        :key="i.id || '_' + Math.random()"
        :data-id="i.id"
        class="flex flex-col items-start justify-center p-3 rounded-md cursor-pointer transition-all duration-200 border shadow-sm bg-white hover:bg-gray-100 hover:shadow-md group"
        :class="[elements.length > 0 && activeId === i.id ? 'active-song' : '', isLoading ? 'opacity-50 pointer-events-none' : '']"
        @click="elements.length > 0 && $emit('changeSong', i.id)"
        v-auto-animate
      >
        <div v-if="elements.length > 0" class="w-full" v-auto-animate>
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center opacity-50 gap-1">
              <Icon
                class="size-3 opacity-65"
                :name="i.type === 'Especial' ? 'tabler:user-circle' : 'tabler:book'"
              />
              <span class="font-medium text-gray-700 text-sm">
                {{ i.type }}
              </span>
            </div>
            <span v-if="i.type !== 'Especial'" class="text-xs font-semibold px-2 py-0.5 bg-gray-100 rounded-full text-gray-600" v-html="highlightText(i.nh.toString(), props.searchTerm || '')">
            </span>
          </div>
          <div class="mt-1">
            <span class="font-medium text-gray-800 overflow-hidden text-ellipsis block" v-html="truncateText(highlightText(i.title, props.searchTerm || ''), 70)">
            </span>
          </div>
          <div v-if="isSearching && i.content" class="mt-2 text-sm text-gray-500 overflow-hidden text-ellipsis bg-gray-50 rounded-md p-2 group-hover:bg-white/80 transition-colors">
            <div class="line-clamp-2" v-html="truncateText(highlightText(i.content, props.searchTerm || ''), 160)"></div>
          </div>
        </div>
        <Skeleton v-else class="w-full h-[72px] rounded-md" />
      </li>
      <li v-if="elements.length === 0 && !isLoading" class="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Icon name="tabler:search-off" class="size-10 mb-2 opacity-40" />
        <p>No se encontraron resultados</p>
      </li>
    </ul>
  </div>
</template>

<style>
.active-song {
  @apply !bg-emerald-100 !text-emerald-700 !shadow-lg;
  & * {
    @apply !text-emerald-700;
  }
}

mark {
  @apply transition-colors duration-200;
}

.song-list-container {
  @apply h-full max-h-full select-none will-change-scroll;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* Asegurar que el contenedor line-clamp funcione correctamente */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>