# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# System deps needed to compile some Python packages
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install CPU-only torch WITHOUT torchvision/torchaudio — this service is NLP-only.
# torchvision conflicts with transformers on cpu builds (torchvision::nms kernel missing).
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu

RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# Pre-bake models into the image layer — zero network required at runtime/deploy
RUN python -c "\
from transformers import pipeline; \
pipeline('token-classification', model='oliverguhr/fullstop-punctuation-multilingual-sonar-base')"

RUN python -c "\
from sentence_transformers import SentenceTransformer; \
SentenceTransformer('intfloat/multilingual-e5-small')"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
