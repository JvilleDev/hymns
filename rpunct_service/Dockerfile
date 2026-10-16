# syntax=docker/dockerfile:1

# Stage 1: export punct model to ONNX (torch lives ONLY here)
FROM python:3.11-slim AS exporter
WORKDIR /app
COPY scripts/export_punct_onnx.py scripts/export_punct_onnx.py
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install "torch==2.5.1" --extra-index-url https://download.pytorch.org/whl/cpu \
    "optimum[onnxruntime]>=1.24" "transformers==4.47.1" huggingface_hub
RUN python scripts/export_punct_onnx.py

# Stage 2: CPU-only ONNX runtime, zero torch
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
COPY --from=exporter /app/onnx ./onnx

# Pre-bake e5-small ONNX (official onnx/ subfolder, O4 optimized)
RUN python -c "\
from optimum.onnxruntime import ORTModelForFeatureExtraction; \
from transformers import AutoTokenizer; \
AutoTokenizer.from_pretrained('intfloat/multilingual-e5-small', subfolder='onnx'); \
ORTModelForFeatureExtraction.from_pretrained('intfloat/multilingual-e5-small', subfolder='onnx', file_name='model_O4.onnx', provider='CPUExecutionProvider')"

COPY app.py .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
