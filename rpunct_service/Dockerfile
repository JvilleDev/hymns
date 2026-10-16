# syntax=docker/dockerfile:1
# Runtime CPU-only, sin dependencias pesadas en build ni en runtime.
# Punctuación: ONNX oficial int8 (onnx-community/punctuate-all-ONNX) + tokenizer
# kredor/punctuate-all, pre-bakeados abajo. Si faltan, el servicio arranca
# igual (punct degradado a texto original, ver /health).
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
COPY app.py .
COPY onnx ./onnx

# Pre-bake modelos ONNX (solo huggingface_hub como downloader):
# - e5-small: onnx/* + tokenizer + pooling (el servicio lo lee de ./onnx/e5)
# - punct: model_quantized.onnx int8 + config (el servicio lo lee de ./onnx/punct)
# - punct tokenizer (kredor): tokenizer + config (-> ./onnx/punct-tok)
RUN python -c "\
from huggingface_hub import snapshot_download; \
snapshot_download(repo_id='intfloat/multilingual-e5-small', local_dir='/app/onnx/e5', allow_patterns=['onnx/*','tokenizer*','config.json','1_Pooling/*']); \
snapshot_download(repo_id='onnx-community/punctuate-all-ONNX', local_dir='/app/onnx/punct', allow_patterns=['onnx/model_quantized.onnx','onnx/config.json']); \
snapshot_download(repo_id='kredor/punctuate-all', local_dir='/app/onnx/punct-tok', allow_patterns=['tokenizer*','config.json'])"

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
