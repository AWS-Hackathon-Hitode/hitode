FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    openai-whisper \
    boto3 \
    torch \
    torchaudio

COPY processing.py /opt/ml/code/processing.py

ENTRYPOINT ["python", "/opt/ml/code/processing.py"]
