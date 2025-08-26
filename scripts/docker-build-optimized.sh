#!/bin/bash

# Short Video Maker - Optimized Docker Build Script
# Builds multi-architecture Docker images with optimization

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
VERSION=$(node -p "require('./package.json').version")
REGISTRY="gyoridavid"
IMAGE_NAME="short-video-maker"
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT=$(git rev-parse --short HEAD)

print_status "🚀 Starting optimized Docker build for Short Video Maker v$VERSION"
print_status "📦 Registry: $REGISTRY"
print_status "🏷️  Tags: latest, $VERSION"
print_status "📅 Build Date: $BUILD_DATE"
print_status "🔗 Git Commit: $GIT_COMMIT"

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "src" ]]; then
    print_error "This script must be run from the Short Video Maker project root!"
    exit 1
fi

# Check Docker buildx
if ! docker buildx version &> /dev/null; then
    print_error "Docker buildx is required for multi-platform builds!"
    exit 1
fi

# Create and use buildx builder
BUILDER_NAME="short-video-builder"
if ! docker buildx inspect $BUILDER_NAME &> /dev/null; then
    print_status "🔨 Creating buildx builder: $BUILDER_NAME"
    docker buildx create --name $BUILDER_NAME --use --bootstrap
else
    print_status "🔨 Using existing buildx builder: $BUILDER_NAME"
    docker buildx use $BUILDER_NAME
fi

# Clean up before build
print_status "🧹 Cleaning Docker cache..."
docker buildx prune -f

# Build arguments
BUILD_ARGS="--build-arg VERSION=$VERSION --build-arg BUILD_DATE=$BUILD_DATE --build-arg GIT_COMMIT=$GIT_COMMIT"

# Function to build and push image
build_image() {
    local dockerfile=$1
    local tag_suffix=$2
    local platforms=$3
    local push_flag=$4
    
    local tags="-t $REGISTRY/$IMAGE_NAME:latest$tag_suffix -t $REGISTRY/$IMAGE_NAME:$VERSION$tag_suffix"
    
    print_status "🏗️  Building $dockerfile for platforms: $platforms"
    
    if docker buildx build \
        --platform $platforms \
        $tags \
        -f $dockerfile \
        $BUILD_ARGS \
        $push_flag \
        .; then
        print_success "✅ Successfully built $dockerfile"
    else
        print_error "❌ Failed to build $dockerfile"
        return 1
    fi
}

# Determine if we should push (default: no)
PUSH_FLAG="--load"
if [[ "$1" == "--push" ]]; then
    PUSH_FLAG="--push"
    print_warning "🚀 Push mode enabled - images will be pushed to registry"
else
    print_status "📦 Load mode - images will be loaded locally (use --push to push to registry)"
fi

# Build standard image (multi-platform)
if [[ -f "main.Dockerfile" ]]; then
    build_image "main.Dockerfile" "" "linux/amd64,linux/arm64" "$PUSH_FLAG"
else
    print_error "main.Dockerfile not found!"
    exit 1
fi

# Build CUDA image (AMD64 only)
if [[ -f "main-cuda.Dockerfile" ]]; then
    build_image "main-cuda.Dockerfile" "-cuda" "linux/amd64" "$PUSH_FLAG"
else
    print_warning "main-cuda.Dockerfile not found, skipping CUDA build"
fi

# Build tiny image (multi-platform)
if [[ -f "main-tiny.Dockerfile" ]]; then
    build_image "main-tiny.Dockerfile" "-tiny" "linux/amd64,linux/arm64" "$PUSH_FLAG"
else
    print_warning "main-tiny.Dockerfile not found, skipping tiny build"
fi

# Generate build report
print_status "📋 Generating build report..."
cat > docker-build-report.txt << EOF
Short Video Maker - Docker Build Report
Generated: $(date)

🏗️  Build Configuration:
- Version: $VERSION
- Git Commit: $GIT_COMMIT
- Build Date: $BUILD_DATE
- Builder: $BUILDER_NAME

📦 Images Built:
- $REGISTRY/$IMAGE_NAME:latest (linux/amd64,linux/arm64)
- $REGISTRY/$IMAGE_NAME:$VERSION (linux/amd64,linux/arm64)
EOF

if [[ -f "main-cuda.Dockerfile" ]]; then
    cat >> docker-build-report.txt << EOF
- $REGISTRY/$IMAGE_NAME:latest-cuda (linux/amd64)
- $REGISTRY/$IMAGE_NAME:$VERSION-cuda (linux/amd64)
EOF
fi

if [[ -f "main-tiny.Dockerfile" ]]; then
    cat >> docker-build-report.txt << EOF
- $REGISTRY/$IMAGE_NAME:latest-tiny (linux/amd64,linux/arm64)
- $REGISTRY/$IMAGE_NAME:$VERSION-tiny (linux/amd64,linux/arm64)
EOF
fi

cat >> docker-build-report.txt << EOF

🚀 Usage Commands:
# Run standard version
docker run -p 3001:3001 $REGISTRY/$IMAGE_NAME:latest

# Run CUDA version (if available)
docker run --gpus all -p 3001:3001 $REGISTRY/$IMAGE_NAME:latest-cuda

# Run with docker-compose
docker-compose -f docker-compose.optimization.yml up

📊 Image Sizes:
EOF

# Add image sizes if images exist locally
if [[ "$PUSH_FLAG" == "--load" ]]; then
    for tag in "latest" "$VERSION"; do
        if docker image inspect "$REGISTRY/$IMAGE_NAME:$tag" &> /dev/null; then
            size=$(docker image inspect "$REGISTRY/$IMAGE_NAME:$tag" --format='{{.Size}}' | numfmt --to=iec)
            echo "- $REGISTRY/$IMAGE_NAME:$tag: $size" >> docker-build-report.txt
        fi
    done
fi

print_success "📄 Build report generated: docker-build-report.txt"

# Final summary
echo ""
print_success "🎉 Docker build completed successfully!"
print_status "📊 Check docker-build-report.txt for details"

if [[ "$PUSH_FLAG" == "--push" ]]; then
    print_success "🚀 Images pushed to registry!"
    print_status "Pull with: docker pull $REGISTRY/$IMAGE_NAME:latest"
else
    print_status "💡 To push images, run: $0 --push"
fi

echo ""
print_status "🎬 Your Short Video Maker Docker images are ready!"
print_status "Run with: docker-compose -f docker-compose.optimization.yml up"