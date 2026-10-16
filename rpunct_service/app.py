import os

os.environ.setdefault("OMP_NUM_THREADS", "2")

import json
import re
import time
from collections import OrderedDict
from threading import Lock

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import AutoTokenizer
from typing import Dict, List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# ONNX CPU-only models (no torch, no sentence-transformers)
# ---------------------------------------------------------------------------
PUNCT_REPO = os.environ.get("PUNCT_REPO", "onnx-community/punctuate-all-ONNX")
PUNCT_SUBFOLDER = os.environ.get("PUNCT_SUBFOLDER", "onnx")
PUNCT_FILE = os.environ.get("PUNCT_FILE", "model_quantized.onnx")
PUNCT_TOK = os.environ.get("PUNCT_TOK", "kredor/punctuate-all")
PUNCT_ONNX_DIR = os.environ.get("PUNCT_ONNX_DIR", "./onnx/punct")
E5_MODEL_ID = os.environ.get("E5_MODEL_ID", "intfloat/multilingual-e5-small")
E5_ONNX_DIR = os.environ.get("E5_ONNX_DIR", "./onnx/e5")
E5_SUBFOLDER = "onnx"
E5_FILE = "model_O4.onnx"

# Q7: thresholds configurables por env
MERGE_T = float(os.environ.get("MERGE_T", "0.20"))
BREAK_T = float(os.environ.get("BREAK_T", "0.55"))

# E1: limita threads ORT para no bloquear el loop (endpoints sync -> threadpool)
_ORT_THREADS = int(os.environ.get("OMP_NUM_THREADS", "2") or 2)
try:
    from onnxruntime import SessionOptions as _OrtSessionOptions

    _ORT_SESSION_OPTIONS = _OrtSessionOptions()
    _ORT_SESSION_OPTIONS.intra_op_num_threads = _ORT_THREADS
except Exception:
    _ORT_SESSION_OPTIONS = None

# shortcut: punct usa int8 oficial (model_quantized.onnx, ~279MB).

print("Using provider: CPUExecutionProvider")

# ---------------------------------------------------------------------------
# FASE 1 — Punctuation model (ONNX, raw onnxruntime)
# ---------------------------------------------------------------------------
punct_tokenizer = None
punct_session = None
punct_id2label: Dict[int, str] = {0: "0", 1: ".", 2: ",", 3: "?", 4: "-", 5: ":"}
try:
    print("Loading punctuation ONNX model...")
    _punct_base = [PUNCT_ONNX_DIR, "./onnx/punct", "/app/onnx/punct"]
    _punct_dirs = [d for b in _punct_base if b for d in (b, os.path.join(b, "onnx"))]
    _punct_file = next(
        (os.path.join(d, PUNCT_FILE) for d in _punct_dirs
         if os.path.isfile(os.path.join(d, PUNCT_FILE))),
        None,
    )
    if _punct_file is None:  # fetch only the quantized onnx, no torch needed
        from huggingface_hub import hf_hub_download

        _punct_file = hf_hub_download(
            PUNCT_REPO, subfolder=PUNCT_SUBFOLDER, filename=PUNCT_FILE
        )
    _punct_tok_dirs = _punct_dirs + ["./onnx/punct-tok", "/app/onnx/punct-tok"]
    _punct_tok_dir = next(
        (d for d in _punct_tok_dirs if os.path.isfile(os.path.join(d, "tokenizer.json"))),
        None,
    )
    punct_tokenizer = AutoTokenizer.from_pretrained(
        _punct_tok_dir if _punct_tok_dir is not None else PUNCT_TOK
    )
    punct_session = ort.InferenceSession(
        _punct_file,
        sess_options=_ORT_SESSION_OPTIONS,
        providers=["CPUExecutionProvider"],
    )
    for _cfg_d in _punct_dirs:  # config local manda si existe
        _cfg_p = os.path.join(_cfg_d, "config.json")
        if os.path.isfile(_cfg_p):
            with open(_cfg_p, encoding="utf-8") as _cfg_f:
                _cfg = json.load(_cfg_f)
            if _cfg.get("id2label"):
                punct_id2label = {int(k): str(v) for k, v in _cfg["id2label"].items()}
            break
    print("Punctuation ONNX model loaded successfully.")
except Exception as e:
    print(f"Error loading punctuation ONNX model: {e}")
    punct_tokenizer = None
    punct_session = None


def _punct_predict(text: str) -> List[dict]:
    """Raw-ORT replacement for pipeline(aggregation_strategy="simple"):
    argmax over logits + id2label, grouping subwords (▁/##) per word
    (word label = first subword label)."""
    enc = punct_tokenizer(text, truncation=True, max_length=512, return_tensors="np")
    feed = {
        k: np.asarray(enc[k], dtype=np.int64)
        for k in ("input_ids", "attention_mask")
        if k in enc
    }
    logits = punct_session.run(None, feed)[0]
    pred = logits.argmax(axis=-1)[0]
    ids = np.asarray(enc["input_ids"])[0]
    mask = np.asarray(enc.get("attention_mask", np.ones_like(ids)))[0].astype(bool)
    tokens = punct_tokenizer.convert_ids_to_tokens(ids)
    special = set(punct_tokenizer.all_special_tokens)
    words: List[list] = []
    for tok, p, m in zip(tokens, pred.tolist(), mask.tolist()):
        if not m or tok in special:
            continue
        label = punct_id2label.get(int(p), "0")
        if tok.startswith("▁") or tok.startswith("Ġ"):
            words.append([tok, label])  # new word, keep prefix for assembler
        elif tok.startswith("##"):
            if words:
                words[-1][0] += tok[2:]  # keep first-subword label
            else:
                words.append([tok[2:], label])
        elif words:
            words[-1][0] += tok  # continuation piece: keep first-subword label
        else:
            words.append([tok, label])
    return [{"word": w, "entity": lb} for w, lb in words]

# ---------------------------------------------------------------------------
# FASE 3 — Sentence-embeddings model (ONNX e5-small, raw onnxruntime)
# ---------------------------------------------------------------------------
embed_tokenizer = None
embed_model = None
try:
    print("Loading e5-small ONNX model...")
    _e5_base = [E5_ONNX_DIR, "./onnx/e5", "/app/onnx/e5"]
    _e5_dirs = [d for b in _e5_base if b for d in (b, os.path.join(b, "onnx"))]
    _e5_file = next(
        (os.path.join(d, E5_FILE) for d in _e5_dirs
         if os.path.isfile(os.path.join(d, E5_FILE))),
        None,
    )
    if _e5_file is None:  # fetch only the quantized onnx, no torch needed
        from huggingface_hub import hf_hub_download

        _e5_file = hf_hub_download(
            E5_MODEL_ID, subfolder=E5_SUBFOLDER, filename=E5_FILE
        )
    _e5_tok_dir = next(
        (d for d in _e5_dirs if os.path.isfile(os.path.join(d, "tokenizer.json"))),
        None,
    )
    embed_tokenizer = AutoTokenizer.from_pretrained(
        _e5_tok_dir if _e5_tok_dir is not None else E5_MODEL_ID,
        **({} if _e5_tok_dir is not None else {"subfolder": E5_SUBFOLDER}),
    )
    embed_model = ort.InferenceSession(
        _e5_file,
        sess_options=_ORT_SESSION_OPTIONS,
        providers=["CPUExecutionProvider"],
    )
    print("Embedding ONNX model loaded successfully.")
except Exception as e:
    print(f"Error loading embedding ONNX model: {e}")
    embed_tokenizer = None
    embed_model = None


# Q6: LRU texto -> vector (max 2000) para no re-embeder oraciones repetidas
_EMBED_CACHE: "OrderedDict[str, np.ndarray]" = OrderedDict()
_EMBED_CACHE_MAX = 2000
_EMBED_CACHE_LOCK = Lock()


def _embed_texts(texts: List[str]):
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    missing: List[str] = []
    seen_missing = set()
    with _EMBED_CACHE_LOCK:
        for t in texts:
            if t not in _EMBED_CACHE and t not in seen_missing:
                seen_missing.add(t)
                missing.append(t)
    if missing:
        encoded = embed_tokenizer(
            missing, padding=True, truncation=True, max_length=512, return_tensors="np"
        )
        feed = {
            k: np.asarray(encoded[k], dtype=np.int64)
            for k in ("input_ids", "attention_mask")
            if k in encoded
        }
        hidden = np.asarray(embed_model.run(None, feed)[0])
        mask = np.asarray(encoded["attention_mask"], dtype=np.float32)[..., None]
        summed = (hidden * mask).sum(axis=1)
        counts = mask.sum(axis=1).clip(min=1e-9)
        mean = summed / counts
        norms = np.linalg.norm(mean, axis=1, keepdims=True).clip(min=1e-10)
        vecs = mean / norms
        with _EMBED_CACHE_LOCK:
            for t, v in zip(missing, vecs):
                _EMBED_CACHE[t] = v.astype(np.float32)
                _EMBED_CACHE.move_to_end(t)
                while len(_EMBED_CACHE) > _EMBED_CACHE_MAX:
                    _EMBED_CACHE.popitem(last=False)
    with _EMBED_CACHE_LOCK:
        return np.stack([np.asarray(_EMBED_CACHE[t]) for t in texts])

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class TextRequest(BaseModel):
    text: str


class SegmentRequest(BaseModel):
    window_a: List[str]
    window_b: List[str]


class SegmentWindow(BaseModel):
    afterIndex: int
    window_a: List[str]
    window_b: List[str]


class SegmentBatchRequest(BaseModel):
    windows: List[SegmentWindow]


# ---------------------------------------------------------------------------
# FASE 1 — /punctuate  (preserved exactly as original)
# ---------------------------------------------------------------------------
@app.post("/punctuate")
def punctuate_text(request: TextRequest):
    if not request.text.strip():
        return {"text": "", "time_ms": 0}
    if punct_session is None or punct_tokenizer is None:
        return {"text": request.text, "time_ms": 0}

    start_time = time.time()
    try:
        def _chunks(text: str):
            words = text.split()
            if len(words) <= 400:  # avoids truncating past 512 tokens
                return [text]
            parts = re.split(r"(?<=[.!?])\s+", text)
            out, cur = [], ""
            for p in parts:
                if len((cur + " " + p).split()) > 400:
                    if cur:
                        out.append(cur)
                    cur = p
                else:
                    cur = (cur + " " + p).strip()
            if cur:
                out.append(cur)
            return out or [text]

        def get_punctuated_text(text):
            output = _punct_predict(text)

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

        punctuated = " ".join(
            get_punctuated_text(c) for c in _chunks(request.text)
        )
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
    r"abramos nuestras biblias en",
    r"vamos a orar",
    r"inclinemos",
    r"lectura de la palabra",
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
    return float(np.dot(a, b))


def _decide(break_score: float) -> str:
    if break_score < MERGE_T:
        return "MERGE"
    if break_score > BREAK_T:
        return "BREAK"
    return "AMBIGUOUS"


def _score_pairs(pairs: List[tuple]) -> List[dict]:
    """Dedupe textos de ventana, un solo _embed_texts, cosenos numpy."""
    texts_a = ["query: " + " ".join(a) for a, _ in pairs]
    texts_b = ["query: " + " ".join(b) for _, b in pairs]
    uniq: List[str] = []
    idx: Dict[str, int] = {}
    for t in texts_a + texts_b:
        if t not in idx:
            idx[t] = len(uniq)
            uniq.append(t)
    embeddings = _embed_texts(uniq)
    out = []
    for ta, tb in zip(texts_a, texts_b):
        similarity = round(float(np.dot(embeddings[idx[ta]], embeddings[idx[tb]])), 4)
        break_score = round(1.0 - similarity, 4)
        out.append({"break_score": break_score, "similarity": similarity, "decision": _decide(break_score)})
    return out


@app.post("/segment")
def segment_endpoint(request: SegmentRequest):
    if embed_model is None or embed_tokenizer is None:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")

    start_time = time.time()

    scored = _score_pairs([(request.window_a, request.window_b)])[0]

    time_ms = round((time.time() - start_time) * 1000, 2)
    return {
        "break_score": scored["break_score"],
        "decision": scored["decision"],
        "similarity": scored["similarity"],
        "time_ms": time_ms,
    }


@app.post("/segment_batch")
def segment_batch_endpoint(request: SegmentBatchRequest):
    if embed_model is None or embed_tokenizer is None:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")

    start_time = time.time()

    if not request.windows:
        return {"decisions": [], "time_ms": 0}

    scored = _score_pairs([(w.window_a, w.window_b) for w in request.windows])
    decisions = [
        {
            "afterIndex": w.afterIndex,
            "break_score": s["break_score"],
            "similarity": s["similarity"],
            "decision": s["decision"],
        }
        for w, s in zip(request.windows, scored)
    ]

    time_ms = round((time.time() - start_time) * 1000, 2)
    return {"decisions": decisions, "time_ms": time_ms}


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "provider": "CPUExecutionProvider",
        "threads": {
            "omp_num_threads": os.environ.get("OMP_NUM_THREADS", "2"),
            "intra_op_num_threads": _ORT_THREADS,
        },
        "thresholds": {"merge_t": MERGE_T, "break_t": BREAK_T},
        "models": {
            "punctuation": "loaded" if punct_session is not None else "unavailable",
            "embeddings": "loaded" if embed_model is not None else "unavailable",
        },
        "onnx_files": {
            "punct_dir": os.path.isdir(PUNCT_ONNX_DIR),
            "punct_model": os.path.isfile(os.path.join(PUNCT_ONNX_DIR, PUNCT_FILE))
            or os.path.isfile(os.path.join(PUNCT_ONNX_DIR, "onnx", PUNCT_FILE)),
        },
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
