import os

os.environ.setdefault("OMP_NUM_THREADS", "2")

import gc
import json
import re
import time
import unicodedata
from collections import OrderedDict
from contextlib import contextmanager
from threading import Lock, Thread

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tokenizers import Tokenizer
from typing import Dict, List, Optional

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
# punct usa int8 oficial (model_quantized.onnx, ~279MB).

# Estado idle: los modelos se cargan en el primer uso y se descargan tras
# IDLE_TTL segundos sin requests (0 = nunca descargar).
IDLE_TTL = float(os.environ.get("IDLE_TTL", "300"))
# Modelos a cargar al arrancar (coma-separado: punct,e5). Vacío = ninguno.
PRELOAD = [m.strip() for m in os.environ.get("PRELOAD", "").split(",") if m.strip()]

print("Using provider: CPUExecutionProvider")


def _session_options():
    """Sin arena/mem-pattern: con inputs de largo variable la arena crece y no
    devuelve memoria al SO."""
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = _ORT_THREADS
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    return opts


def _malloc_trim():
    try:
        import ctypes

        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


class LazyModel:
    """Carga bajo demanda (primer use()) y descarga por inactividad."""

    def __init__(self, name: str, loader):
        self.name = name
        self._loader = loader
        self._lock = Lock()
        self.value = None
        self.state = "idle"  # idle | loading | loaded | error
        self.error: Optional[str] = None
        self.active = 0
        self.last_used = 0.0

    @contextmanager
    def use(self):
        with self._lock:
            if self.value is None:
                self.state = "loading"
                t0 = time.time()
                try:
                    self.value = self._loader()
                except Exception as e:
                    self.state, self.error = "error", str(e)
                    print(f"Error loading {self.name}: {e}")
                    raise
                self.error = None
                print(f"[{self.name}] loaded in {time.time() - t0:.1f}s")
            self.state = "loaded"
            self.active += 1
            self.last_used = time.monotonic()
        try:
            yield self.value
        finally:
            with self._lock:
                self.active -= 1
                self.last_used = time.monotonic()

    def unload_if_idle(self, ttl: float) -> bool:
        with self._lock:
            if (
                self.value is None
                or self.active
                or time.monotonic() - self.last_used < ttl
            ):
                return False
            self.value = None
            self.state = "idle"
        print(f"[{self.name}] unloaded after {ttl:.0f}s idle")
        return True


def _hf_tokenizer(local_dirs, repo, subfolder=None, max_length=512):
    path = next(
        (os.path.join(d, "tokenizer.json") for d in local_dirs
         if os.path.isfile(os.path.join(d, "tokenizer.json"))),
        None,
    )
    if path is None:
        from huggingface_hub import hf_hub_download

        path = hf_hub_download(
            repo, "tokenizer.json", **({"subfolder": subfolder} if subfolder else {})
        )
    tok = Tokenizer.from_file(path)
    tok.enable_truncation(max_length=max_length)
    return tok


# ---------------------------------------------------------------------------
# FASE 1 — Punctuation model (ONNX, raw onnxruntime)
# ---------------------------------------------------------------------------
_PUNCT_ID2LABEL: Dict[int, str] = {0: "0", 1: ".", 2: ",", 3: "?", 4: "-", 5: ":"}


def _load_punct():
    base = [PUNCT_ONNX_DIR, "./onnx/punct", "/app/onnx/punct"]
    dirs = [d for b in base if b for d in (b, os.path.join(b, "onnx"))]
    model_file = next(
        (os.path.join(d, PUNCT_FILE) for d in dirs
         if os.path.isfile(os.path.join(d, PUNCT_FILE))),
        None,
    )
    if model_file is None:  # fetch only the quantized onnx, no torch needed
        from huggingface_hub import hf_hub_download

        model_file = hf_hub_download(
            PUNCT_REPO, subfolder=PUNCT_SUBFOLDER, filename=PUNCT_FILE
        )
    tok_dirs = dirs + ["./onnx/punct-tok", "/app/onnx/punct-tok"]
    tokenizer = _hf_tokenizer(tok_dirs, PUNCT_TOK)
    session = ort.InferenceSession(
        model_file, sess_options=_session_options(), providers=["CPUExecutionProvider"]
    )
    id2label = dict(_PUNCT_ID2LABEL)
    for d in dirs:  # config local manda si existe
        p = os.path.join(d, "config.json")
        if os.path.isfile(p):
            with open(p, encoding="utf-8") as f:
                cfg = json.load(f)
            if cfg.get("id2label"):
                id2label = {int(k): str(v) for k, v in cfg["id2label"].items()}
            break
    return tokenizer, session, id2label


punct_model = LazyModel("punct", _load_punct)


def _punct_predict(text: str, tokenizer, session, id2label) -> List[dict]:
    """Raw-ORT replacement for pipeline(aggregation_strategy="simple"):
    argmax over logits + id2label, grouping subwords (▁/##) per word
    (word label = first subword label)."""
    enc = tokenizer.encode(text)
    feed = {
        "input_ids": np.asarray([enc.ids], dtype=np.int64),
        "attention_mask": np.asarray([enc.attention_mask], dtype=np.int64),
    }
    logits = session.run(None, feed)[0]
    pred = logits.argmax(axis=-1)[0]
    words: List[list] = []
    for tok, p, m, sp in zip(
        enc.tokens, pred.tolist(), enc.attention_mask, enc.special_tokens_mask
    ):
        if not m or sp:
            continue
        label = id2label.get(int(p), "0")
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
def _load_e5():
    base = [E5_ONNX_DIR, "./onnx/e5", "/app/onnx/e5"]
    dirs = [d for b in base if b for d in (b, os.path.join(b, "onnx"))]
    model_file = next(
        (os.path.join(d, E5_FILE) for d in dirs
         if os.path.isfile(os.path.join(d, E5_FILE))),
        None,
    )
    if model_file is None:  # fetch only the quantized onnx, no torch needed
        from huggingface_hub import hf_hub_download

        model_file = hf_hub_download(
            E5_MODEL_ID, subfolder=E5_SUBFOLDER, filename=E5_FILE
        )
    tokenizer = _hf_tokenizer(dirs, E5_MODEL_ID, subfolder=E5_SUBFOLDER)
    pad_id = tokenizer.token_to_id("<pad>")
    tokenizer.enable_padding(
        pad_id=pad_id if pad_id is not None else 1, pad_token="<pad>"
    )
    session = ort.InferenceSession(
        model_file, sess_options=_session_options(), providers=["CPUExecutionProvider"]
    )
    return tokenizer, session


embed_model = LazyModel("e5", _load_e5)


def _idle_reaper():
    interval = max(5.0, min(30.0, IDLE_TTL / 2))
    while True:
        time.sleep(interval)
        freed = False
        for m in (punct_model, embed_model):
            freed = m.unload_if_idle(IDLE_TTL) or freed
        if freed:
            with _EMBED_CACHE_LOCK:
                _EMBED_CACHE.clear()
            gc.collect()
            _malloc_trim()


def _warm_start():
    for name, m in (("punct", punct_model), ("e5", embed_model)):
        if name in PRELOAD:
            try:
                with m.use():
                    pass
            except Exception:
                pass


@app.on_event("startup")
def _startup():
    if IDLE_TTL > 0:
        Thread(target=_idle_reaper, daemon=True, name="idle-reaper").start()
    if PRELOAD:
        Thread(target=_warm_start, daemon=True, name="preload").start()


# Q6: LRU texto -> vector (max 2000) para no re-embeder oraciones repetidas
_EMBED_CACHE: "OrderedDict[str, np.ndarray]" = OrderedDict()
_EMBED_CACHE_MAX = 2000
_EMBED_CACHE_LOCK = Lock()


def _embed_texts(texts: List[str]):
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    found: Dict[str, np.ndarray] = {}
    missing: List[str] = []
    with _EMBED_CACHE_LOCK:
        for t in texts:
            if t in found or t in missing:
                continue
            if t in _EMBED_CACHE:
                found[t] = _EMBED_CACHE[t]
            else:
                missing.append(t)
    if missing:
        with embed_model.use() as (tokenizer, session):
            encodings = tokenizer.encode_batch(missing)
            feed = {
                "input_ids": np.asarray([e.ids for e in encodings], dtype=np.int64),
                "attention_mask": np.asarray(
                    [e.attention_mask for e in encodings], dtype=np.int64
                ),
            }
            hidden = np.asarray(session.run(None, feed)[0])
        mask = feed["attention_mask"].astype(np.float32)[..., None]
        summed = (hidden * mask).sum(axis=1)
        counts = mask.sum(axis=1).clip(min=1e-9)
        mean = summed / counts
        norms = np.linalg.norm(mean, axis=1, keepdims=True).clip(min=1e-10)
        vecs = (mean / norms).astype(np.float32)
        with _EMBED_CACHE_LOCK:
            for t, v in zip(missing, vecs):
                found[t] = v
                _EMBED_CACHE[t] = v
                _EMBED_CACHE.move_to_end(t)
                while len(_EMBED_CACHE) > _EMBED_CACHE_MAX:
                    _EMBED_CACHE.popitem(last=False)
    return np.stack([found[t] for t in texts])

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class TextRequest(BaseModel):
    text: str


class SegmentRequest(BaseModel):
    window_a: List[str]
    window_b: List[str]
    gapMs: Optional[float] = None


class SegmentWindow(BaseModel):
    afterIndex: int
    window_a: List[str]
    window_b: List[str]
    gapMs: Optional[float] = None


class SegmentBatchRequest(BaseModel):
    windows: List[SegmentWindow]


# ---------------------------------------------------------------------------
# FASE 1 — /punctuate  (preserved exactly as original)
# ---------------------------------------------------------------------------
@app.post("/punctuate")
def punctuate_text(request: TextRequest):
    if not request.text.strip():
        return {"text": "", "time_ms": 0}

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
            output = _punct_predict(text, *punct_handles)

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

        chunks = _chunks(request.text)
        with punct_model.use() as punct_handles:
            punctuated = " ".join(
                get_punctuated_text(c) for c in chunks
            )
        duration_ms = round((time.time() - start_time) * 1000, 2)
        print(f"[punctuate {duration_ms}ms] in={len(request.text)}chars/{len(request.text.split())}words chunks={len(chunks)} out={len(punctuated)}chars preview={punctuated[:120]!r}")
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

    # --- Rule 2: Micro-fragments (<=12 words, no verb; liturgical anchors never merge) ---
    final_lines: list[str] = []
    for line in merged_lines:
        words = line.split()
        if (
            len(words) <= 12
            and not _has_verb(line)
            and not _BREAK_ANCHOR_RE.search(line)
            and final_lines
        ):
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


# Brain #2/#5/#6 — priors aditivos sobre break_score (agrupan, no reescriben texto)
_CONTINUATION_SINGLES = {"y", "pero", "porque", "ademas", "tambien", "ese", "esto", "eso"}
_CONTINUATION_MULTI = ("por eso", "es decir")
_TOPIC_MULTI = ("pasemos a", "quiero hablarles")
_TOPIC_SINGLES = {"hoy", "ahora"}
_GAP_MERGE_MS = 1500.0
_GAP_BREAK_MS = 3000.0


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _window_start_class(window_b: List[str]) -> tuple:
    """(clase, primera_palabra): continuation | topic | other."""
    text = " ".join(window_b).strip()
    first = re.split(r"\s+", text, maxsplit=1)[0].lower().strip(".,;:\"'¿?¡!") if text else ""
    norm_text = _strip_accents(text.lower())
    norm_first = _strip_accents(first)
    if norm_text.startswith(_CONTINUATION_MULTI) or norm_first in _CONTINUATION_SINGLES:
        return "continuation", first
    if norm_text.startswith(_TOPIC_MULTI) or norm_first in _TOPIC_SINGLES:
        return "topic", first
    return "other", first


def _apply_priors(raw_break: float, window_b: List[str], gap_ms) -> tuple:
    """Suma sesgos #2/#5/#6; devuelve (final_score, priors, clase, primera_palabra)."""
    bias, applied = 0.0, []
    cls, first = _window_start_class(window_b)
    if cls == "continuation":
        bias -= 0.15
        applied.append("continuation-0.15")
    elif cls == "topic":
        bias += 0.15
        applied.append("topic+0.15")
    g = None
    if gap_ms is not None:
        try:
            g = float(gap_ms)
        except (TypeError, ValueError):
            g = None
    if g is not None:
        if g < _GAP_MERGE_MS:
            bias -= 0.10
            applied.append(f"gap{g:.0f}ms-0.10")
        elif g > _GAP_BREAK_MS:
            bias += 0.10
            applied.append(f"gap{g:.0f}ms+0.10")
    return min(1.0, max(0.0, round(raw_break + bias, 4))), applied, cls, first


def _score_pairs(pairs: List[tuple], gaps: List = None) -> List[dict]:
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
    for idx, (ta, tb) in enumerate(zip(texts_a, texts_b)):
        similarity = round(float(np.dot(embeddings[idx[ta]], embeddings[idx[tb]])), 4)
        raw_break = round(1.0 - similarity, 4)
        wb = pairs[idx][1]
        gap = gaps[idx] if gaps is not None and idx < len(gaps) else None
        final, applied, cls, first = _apply_priors(raw_break, wb, gap)
        out.append({
            "break_score": final,
            "raw_break": raw_break,
            "similarity": similarity,
            "decision": _decide(final),
            "priors": applied,
            "start_class": cls,
            "start_word": first,
        })
    return out


@app.post("/segment")
def segment_endpoint(request: SegmentRequest):
    start_time = time.time()

    try:
        scored = _score_pairs(
            [(request.window_a, request.window_b)], [request.gapMs]
        )[0]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Embedding model unavailable: {e}")

    time_ms = round((time.time() - start_time) * 1000, 2)
    wa_n = len(" ".join(request.window_a).split())
    wb_n = len(" ".join(request.window_b).split())
    print(f"[segment {time_ms}ms] cos={scored['similarity']:.3f} raw={scored['raw_break']:.3f} "
          f"score={scored['break_score']:.3f} wa_words={wa_n} wb_words={wb_n} "
          f"start='{scored['start_word']}' cls={scored['start_class']} priors={scored['priors']} "
          f"decision={scored['decision']} gapMs={request.gapMs}")
    return {
        "break_score": scored["break_score"],
        "decision": scored["decision"],
        "similarity": scored["similarity"],
        "time_ms": time_ms,
    }


@app.post("/segment_batch")
def segment_batch_endpoint(request: SegmentBatchRequest):
    start_time = time.time()

    if not request.windows:
        return {"decisions": [], "time_ms": 0}

    try:
        scored = _score_pairs(
            [(w.window_a, w.window_b) for w in request.windows],
            [w.gapMs for w in request.windows],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Embedding model unavailable: {e}")
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
    counts = {"BREAK": 0, "MERGE": 0, "AMBIGUOUS": 0}
    for w, s, d in zip(request.windows, scored, decisions):
        counts[d["decision"]] = counts.get(d["decision"], 0) + 1
        wa_n = len(" ".join(w.window_a).split())
        wb_n = len(" ".join(w.window_b).split())
        print(f"[segment gap after={w.afterIndex}] cos={s['similarity']:.3f} raw={s['raw_break']:.3f} "
              f"score={s['break_score']:.3f} wa_words={wa_n} wb_words={wb_n} "
              f"start='{s['start_word']}' cls={s['start_class']} priors={s['priors']} "
              f"decision={s['decision']} gapMs={w.gapMs}")
    print(f"[segment_batch {time_ms}ms] windows={len(decisions)} BREAK={counts['BREAK']} MERGE={counts['MERGE']} AMBIGUOUS={counts['AMBIGUOUS']}")
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
        "idle_ttl_s": IDLE_TTL,
        "models": {
            "punctuation": punct_model.state,
            "embeddings": embed_model.state,
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
