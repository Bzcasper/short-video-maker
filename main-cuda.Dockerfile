ARG UBUNTU_VERSION=22.04
ARG CUDA_VERSION=12.6.3
ARG BASE_CUDA_DEV_CONTAINER=nvidia/cuda:${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION}
ARG BASE_CUDA_RUN_CONTAINER=nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu${UBUNTU_VERSION}

# Ref: https://github.com/ggml-org/whisper.cpp
FROM ${BASE_CUDA_DEV_CONTAINER} AS install-whisper
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install --fix-missing --no-install-recommends -y bash git make vim wget g++ ffmpeg curl

WORKDIR /app/data/libs/whisper
RUN git clone https://github.com/ggerganov/whisper.cpp.git -b v1.7.1 --depth 1 .

RUN make clean
# Optimized CUDA compilation with memory pooling and compute capability targeting
RUN GGML_CUDA=1 CXXFLAGS="-DTHRUST_IGNORE_DEPRECATED_CPP_DIALECT -O3 -march=native -mtune=native" \
    CUDA_DOCKER_ARCH=compute_80 \
    GGML_CUDA_FORCE_DMMV=1 GGML_CUDA_FORCE_MMQ=1 make -j$(nproc)

RUN sh ./models/download-ggml-model.sh medium.en

FROM ${BASE_CUDA_RUN_CONTAINER} AS base

# install node
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN node -v && npm -v

# install dependencies
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app
# Install Python 3.12 from deadsnakes PPA
RUN apt update
RUN apt install -y software-properties-common
RUN add-apt-repository ppa:deadsnakes/ppa
RUN apt update && apt install -y python3.12 python3.12-venv python3-pip

RUN apt update
RUN apt install -y \
      # whisper dependencies
      git \
      wget \
      cmake \
      ffmpeg \
      curl \
      build-essential \
      make \
      # remotion dependencies
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libgbm-dev \
      libasound2 \
      libxrandr2 \
      libxkbcommon-dev \
      libxfixes3 \
      libxcomposite1 \
      libxdamage1 \
      libatk-bridge2.0-0 \
      libpango-1.0-0 \
      libcairo2 \
      libcups2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
# setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* /app/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --no-frozen-lockfile
RUN pnpm install --prefer-offline --no-cache --prod

FROM prod-deps AS build
COPY tsconfig.json /app
COPY tsconfig.build.json /app
COPY vite.config.ts /app
COPY src /app/src
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --no-frozen-lockfile
RUN pnpm build

FROM base
COPY static /app/static
COPY --from=install-whisper /app/data/libs/whisper /app/data/libs/whisper
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY FramePack /app/FramePack
# Install FramePack dependencies in dedicated virtual environment
RUN python3.12 -m venv /app/FramePack/venv
# Install CUDA-optimized PyTorch with memory allocator optimizations
RUN /app/FramePack/venv/bin/pip install torch==2.5.1+cu126 torchvision==0.20.1+cu126 torchaudio==2.5.1+cu126 \
    --index-url https://download.pytorch.org/whl/cu126 --no-cache-dir
    
# Install TensorRT for inference optimization
RUN /app/FramePack/venv/bin/pip install tensorrt --extra-index-url https://pypi.nvidia.com --no-cache-dir

# Install FramePack dependencies with CUDA optimizations
RUN /app/FramePack/venv/bin/pip install -r /app/FramePack/requirements.txt --no-cache-dir

# Install additional CUDA optimization libraries
RUN /app/FramePack/venv/bin/pip install \
    nvidia-ml-py3 \
    cupy-cuda12x \
    nvidia-cuda-runtime-cu12 \
    nvidia-cuda-cupti-cu12 \
    nvidia-cublas-cu12 \
    nvidia-cufft-cu12 \
    nvidia-curand-cu12 \
    nvidia-cusparse-cu12 \
    nvidia-nccl-cu12 \
    --no-cache-dir


COPY --from=build /app/dist /app/dist
COPY package.json /app/

# app configuration via environment variables
ENV DATA_DIR_PATH=/app/data
ENV DOCKER=true
# number of chrome tabs to use for rendering
ENV CONCURRENCY=1
# video cache - 2000MB
ENV VIDEO_CACHE_SIZE_IN_BYTES=2097152000

# CUDA Performance Optimizations
ENV CUDA_VISIBLE_DEVICES=0
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,video
ENV CUDA_MODULE_LOADING=LAZY
ENV TORCH_CUDNN_V8_API_ENABLED=1
ENV CUDNN_BENCHMARK=1
# PyTorch Memory Management
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512,garbage_collection_threshold:0.8,expandable_segments:True
ENV TORCH_CUDA_ARCH_LIST="7.5;8.0;8.6;8.9;9.0"
# FramePack Optimizations
ENV FRAMEPACK_GPU_MEMORY_FRACTION=0.85
ENV FRAMEPACK_USE_TENSORRT=true
ENV FRAMEPACK_ENABLE_MEMORY_POOLING=true
ENV FRAMEPACK_BATCH_SIZE_AUTO=true
# Whisper CUDA Optimizations
ENV WHISPER_CUDA_BATCH_SIZE=16
ENV WHISPER_CUDA_ENABLE_FLASH_ATTENTION=1

# install kokoro, headless chrome and ensure music files are present
RUN node dist/scripts/install.js

# Expose port 8080 for Northflank health checks
EXPOSE 8080

CMD ["pnpm", "start"]
