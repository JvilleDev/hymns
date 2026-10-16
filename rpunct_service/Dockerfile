# syntax=docker/dockerfile:1
# Runtime CPU-only, cero torch/optimum en build.
# El ONNX de puntuación se exporta UNA vez en local:
#   python rpunct_service/scripts/export_punct_onnx.py
# y se vendea/monta en ./onnx/punct-sonar-base. Si falta, el servicio
# arranca igual (punct degradado a texto original, ver /health).
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
COPY app.py .
COPY onnx ./onnx

# Pre-bake e5-small ONNX oficial (solo onnx/* + tokenizer, sin torch/optimum)
RUN python -c "\
from huggingface_hub import snapshot_download; \
snapshot_download(repo_id='intfloat/multilingual-e5-small', local_dir='/app/onnx/e5', allow_patterns=['onnx/*','tokenizer*','config.json','1_Pooling/*'])"

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
