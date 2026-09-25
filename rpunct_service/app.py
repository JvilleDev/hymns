import re
import time
import torch

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline
from typing import List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Device detection
# ---------------------------------------------------------------------------
if torch.backends.mps.is_available():
    device = "mps"
elif torch.cuda.is_available():
    device = "cuda"
else:
    device = "cpu"

print(f"Using device: {device}")

# ---------------------------------------------------------------------------
# FASE 1 — Punctuation model (lazy load)
# ---------------------------------------------------------------------------
try:
    print("Loading Robust Punctuation Model...")
    punct_pipeline = pipeline(
        "token-classification",
        model="oliverguhr/fullstop-punctuation-multilingual-sonar-base",
        device=device,
    )
    print("Model loaded successfully.")
except Exception as e:
    print(f"Error loading punctuation model: {e}")
    punct_pipeline = None

# ---------------------------------------------------------------------------
# FASE 3 — Sentence-embeddings model (lazy load)
# ---------------------------------------------------------------------------
embed_model = None
try:
    print("Loading sentence-transformers model (multilingual-e5-small)...")
    from sentence_transformers import SentenceTransformer
    import numpy as np

    _st_device = "cpu" if device == "mps" else device  # sentence-transformers MPS can be unstable
    embed_model = SentenceTransformer("intfloat/multilingual-e5-small", device=_st_device)
    print("Embedding model loaded successfully.")
except Exception as e:
    print(f"Error loading embedding model: {e}")
    embed_model = None

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class TextRequest(BaseModel):
    text: str


class SegmentRequest(BaseModel):
    window_a: List[str]
    window_b: List[str]


# ---------------------------------------------------------------------------
# FASE 1 — /punctuate  (preserved exactly as original)
# ---------------------------------------------------------------------------
@app.post("/punctuate")
def punctuate_text(request: TextRequest):
    if not request.text.strip():
        return {"text": "", "time_ms": 0}

    start_time = time.time()
    try:
        def get_punctuated_text(text):
            output = punct_pipeline(text)

            result = ""
            last_label = "0"

            for item in output:
                word = item["word"]
                label = item["entity"]

                if word.startswith("\u2581"):
                    if last_label != "0":
                        result += last_label

                    result += " " + word[1:]
                    last_label = label
                else:
                    result += word
                    if label != "0":
                        last_label = label

            if last_label != "0":
                result += last_label

            return result.strip()

        punctuated = get_punctuated_text(request.text)
        duration_ms = round((time.time() - start_time) * 1000, 2)
        print(f"[{duration_ms}ms] Punctuated ({len(request.text)} chars): {punctuated[:120]}")
        return {"text": punctuated, "time_ms": duration_ms}
    except Exception as e:
        print(f"Error restoring punctuation: {e}")
        return {"text": request.text, "time_ms": 0}


# ---------------------------------------------------------------------------
# FASE 2 — /normalize  (deterministic normalization)
# ---------------------------------------------------------------------------

# Prepositions / conjunctions that signal a syntactic continuation
_PREP_CONJ = {
    "de", "del", "en", "que", "y", "o", "a", "con", "por", "para",
    "al", "el", "la", "los", "las", "un", "una",
}

# Main / auxiliary verbs for micro-fragment detection
_VERBS = {
    "ser", "soy", "eres", "es", "somos", "son", "era", "fue",
    "estar", "estoy", "estás", "está", "estamos", "están", "estaba", "estuvo",
    "haber", "he", "has", "ha", "hemos", "han", "había", "hubo",
    "tener", "tengo", "tienes", "tiene", "tenemos", "tienen", "tenía", "tuvo",
    "hacer", "hago", "haces", "hace", "hacemos", "hacen", "hacía", "hizo",
    "ir", "voy", "vas", "va", "vamos", "van", "iba", "fue",
    "poder", "puedo", "puedes", "puede", "podemos", "pueden", "podía", "pudo",
    "deber", "debo", "debes", "debe", "debemos", "deben",
    "querer", "quiero", "quieres", "quiere", "queremos", "quieren",
    "decir", "digo", "dices", "dice", "decimos", "dicen", "dijo",
    "ver", "veo", "ves", "ve", "vemos", "ven", "vio",
    "dar", "doy", "das", "da", "damos", "dan", "dio",
    "saber", "sé", "sabes", "sabe", "sabemos", "saben", "sabía", "supo",
    "venir", "vengo", "vienes", "viene", "venimos", "vienen", "vino",
    "llegar", "llego", "llegas", "llega", "llegamos", "llegan", "llegó",
    "pasar", "paso", "pasas", "pasa", "pasamos", "pasan", "pasó",
    "quedar", "quedo", "quedas", "queda", "quedamos", "quedan", "quedó",
    "creer", "creo", "crees", "cree", "creemos", "creen", "creyó",
    "llevar", "llevo", "llevas", "lleva", "llevamos", "llevan", "llevó",
    "dejar", "dejo", "dejas", "deja", "dejamos", "dejan", "dejó",
    "seguir", "sigo", "sigues", "sigue", "seguimos", "siguen", "siguió",
    "encontrar", "encuentro", "encuentras", "encuentra", "encontramos", "encuentran",
    "llamar", "llamo", "llamas", "llama", "llamamos", "llaman", "llamó",
    "volver", "vuelvo", "vuelves", "vuelve", "volvemos", "vuelven", "volvió",
    "poner", "pongo", "pones", "pone", "ponemos", "ponen", "puso",
    "conocer", "conozco", "conoces", "conoce", "conocemos", "conocen",
    "vivir", "vivo", "vives", "vive", "vivimos", "viven", "vivió",
    "sentir", "siento", "sientes", "siente", "sentimos", "sienten", "sintió",
}

# Break anchor patterns (case-insensitive)
_BREAK_ANCHOR_PATTERNS = [
    r"pueden tomar asiento",
    r"abran sus biblias",
    r"sigue leyendo",
    r"am[eé]n",
    r"aleluya",
    r"gloria a dios",
    r"bendito sea",
    r"demos gracias",
    r"oremos",
    r"sigamos",
    r"continuemos",
]
_BREAK_ANCHOR_RE = re.compile(
    r"(?<![a-záéíóúüñ])(" + "|".join(_BREAK_ANCHOR_PATTERNS) + r")(?![a-záéíóúüñ])",
    re.IGNORECASE,
)


def _ends_without_punctuation(sentence: str) -> bool:
    """True if the sentence does not end with . ! ? ,"""
    stripped = sentence.rstrip()
    return bool(stripped) and stripped[-1] not in ".!?,"


def _starts_with_lowercase_or_prep(sentence: str) -> bool:
    """True if sentence starts with a lowercase letter or a prep/conj."""
    stripped = sentence.lstrip()
    if not stripped:
        return False
    first_word = re.split(r"\s+", stripped)[0].lower().rstrip(".,;:")
    return stripped[0].islower() or first_word in _PREP_CONJ


def _has_verb(sentence: str) -> bool:
    """True if any token in the sentence is a known verb form."""
    tokens = re.findall(r"[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+", sentence.lower())
    return any(t in _VERBS for t in tokens)


def normalize_text(text: str):
    """
    Apply deterministic normalization rules to *text*.
    Returns (normalized_text, changes_list).
    """
    changes: list = []

    # Split into sentences/fragments (split on newlines first)
    lines = text.splitlines()

    # --- Rule 4 (pre-pass): basic cleanup per line ---
    cleaned_lines = []
    for line in lines:
        # Remove lines that contain only punctuation / whitespace
        if re.fullmatch(r"[\s.,!?;:\-–—\"'«»""'']*", line):
            changes.append({"rule": "cleanup_empty_line", "removed": line})
            continue
        # Normalize typographic quotes
        normalized = line
        normalized = re.sub(r"[""„]", '"', normalized)
        normalized = re.sub(r"[''‚]", "'", normalized)
        if normalized != line:
            changes.append({"rule": "normalize_quotes", "original": line, "result": normalized})
        cleaned_lines.append(normalized)

    # --- Rule 1: Syntactic forced union ---
    merged_lines: list[str] = []
    i = 0
    while i < len(cleaned_lines):
        current = cleaned_lines[i]
        if (
            i + 1 < len(cleaned_lines)
            and _ends_without_punctuation(current)
            and _starts_with_lowercase_or_prep(cleaned_lines[i + 1])
        ):
            next_line = cleaned_lines[i + 1]
            merged = current.rstrip() + " " + next_line.lstrip()
            changes.append({
                "rule": "syntactic_union",
                "original_a": current,
                "original_b": next_line,
                "result": merged,
            })
            merged_lines.append(merged)
            i += 2
        else:
            merged_lines.append(current)
            i += 1

    # --- Rule 2: Micro-fragments (<=3 words, no verb) ---
    final_lines: list[str] = []
    for line in merged_lines:
        words = line.split()
        if len(words) <= 3 and not _has_verb(line) and final_lines:
            prev = final_lines[-1]
            merged = prev.rstrip() + " " + line.lstrip()
            changes.append({
                "rule": "micro_fragment",
                "fragment": line,
                "merged_into": prev,
                "result": merged,
            })
            final_lines[-1] = merged
        else:
            final_lines.append(line)

    # --- Rule 3: Break anchors (label only, do NOT remove) ---
    for idx, line in enumerate(final_lines):
        for match in _BREAK_ANCHOR_RE.finditer(line):
            changes.append({
                "rule": "break_anchor",
                "phrase": match.group(0),
                "line_index": idx,
                "span": [match.start(), match.end()],
            })

    # --- Rule 4 (post-pass): collapse multiple spaces ---
    result_lines = [re.sub(r" {2,}", " ", ln) for ln in final_lines]

    return "\n".join(result_lines), changes


@app.post("/normalize")
def normalize_endpoint(request: TextRequest):
    if not request.text.strip():
        return {"text": "", "changes": []}
    normalized, changes = normalize_text(request.text)
    return {"text": normalized, "changes": changes}


# ---------------------------------------------------------------------------
# FASE 3 — /segment  (semantic segmentation with embeddings)
# ---------------------------------------------------------------------------

def _cosine_similarity(a, b) -> float:
    import numpy as np
    a = a / (np.linalg.norm(a) + 1e-10)
    b = b / (np.linalg.norm(b) + 1e-10)
    return float(np.dot(a, b))


@app.post("/segment")
def segment_endpoint(request: SegmentRequest):
    if embed_model is None:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")

    start_time = time.time()

    text_a = "query: " + " ".join(request.window_a)
    text_b = "query: " + " ".join(request.window_b)

    embeddings = embed_model.encode([text_a, text_b], normalize_embeddings=False)
    similarity = _cosine_similarity(embeddings[0], embeddings[1])
    break_score = round(1.0 - similarity, 4)
    similarity = round(float(similarity), 4)

    if break_score < 0.20:
        decision = "MERGE"
    elif break_score > 0.55:
        decision = "BREAK"
    else:
        decision = "AMBIGUOUS"

    time_ms = round((time.time() - start_time) * 1000, 2)
    return {
        "break_score": break_score,
        "decision": decision,
        "similarity": similarity,
        "time_ms": time_ms,
    }


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": device,
        "models": {
            "punctuation": "loaded" if punct_pipeline is not None else "unavailable",
            "embeddings": "loaded" if embed_model is not None else "unavailable",
        },
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
