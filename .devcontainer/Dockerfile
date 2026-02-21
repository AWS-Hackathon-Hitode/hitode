FROM mcr.microsoft.com/devcontainers/typescript-node:20-bookworm

# AWS CLI のインストール（マルチアーキテクチャ対応）
RUN ARCH=$(uname -m) \
    && if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
         URL="https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip"; \
       else \
         URL="https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"; \
       fi \
    && curl "$URL" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws/
