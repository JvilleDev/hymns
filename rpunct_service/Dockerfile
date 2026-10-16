# syntax=docker/dockerfile:1
# Runtime CPU-only, build rápido: NO descarga modelos en build.
# Los modelos se descargan una sola vez en runtime (primer arranque)
# vía hf_hub_download en app.py y persisten en volúmenes:
#   rpunct_onnx:/app/onnx + hf_cache:/root/.cache/huggingface
# Si faltan, el servicio arranca igual (punct degradado, ver /health).
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
COPY app.py .
COPY onnx ./onnx

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
