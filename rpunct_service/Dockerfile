# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# Install necessary system dependencies for torch and simpletransformers
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# Pre-download the model into the Docker image so it doesn't download on every startup
RUN python -c "from simpletransformers.ner import NERModel; NERModel('bert', 'dccuchile/bert-base-spanish-wwm-uncased', use_cuda=False, args={'silent':True})"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
