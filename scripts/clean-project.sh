#!/bin/bash

# Short Video Maker - Project Cleanup Script
# Cleans all temporary files, caches, and generated content

set -e

echo "🧹 Starting Short Video Maker project cleanup..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[CLEANUP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ This script must be run from the project root!"
    exit 1
fi

# 1. Node.js and build artifacts
print_status "Cleaning Node.js artifacts..."
rm -rf node_modules/.cache
rm -rf dist/
rm -rf build/
rm -rf out/
rm -rf .next/
rm -rf coverage/
rm -rf .nyc_output/
print_success "Node.js artifacts cleaned"

# 2. TypeScript compilation cache
print_status "Cleaning TypeScript cache..."
rm -rf .tsbuildinfo
rm -rf tsconfig.tsbuildinfo
print_success "TypeScript cache cleaned"

# 3. Remotion cache and temp files
print_status "Cleaning Remotion cache..."
rm -rf .remotion/
rm -rf remotion-cache/
print_success "Remotion cache cleaned"

# 4. Video generation specific cleanup
print_status "Cleaning video generation temp files..."

# FramePack temporary files
if [[ -d "FramePack/temp" ]]; then
    rm -rf FramePack/temp/*
    print_success "FramePack temp directory cleaned"
fi

if [[ -d "FramePack/output" ]]; then
    rm -rf FramePack/output/*
    print_success "FramePack output directory cleaned"
fi

# Video processing cache
if [[ -d "static/cache" ]]; then
    rm -rf static/cache/*
    print_success "Video cache cleaned"
fi

# Processing status files
find . -name "*.processing" -delete
find . -name "*.rendering" -delete

# Temporary video/audio files
find . -name "temp_*.mp4" -delete
find . -name "temp_*.wav" -delete
find . -name "temp_*.mp3" -delete

print_success "Video generation files cleaned"

# 5. Logs and debugging files
print_status "Cleaning log files..."
rm -rf logs/
find . -name "*.log" -not -path "./node_modules/*" -delete
find . -name "debug-*.txt" -delete
find . -name "error-*.txt" -delete
print_success "Log files cleaned"

# 6. Temporary files and OS artifacts
print_status "Cleaning system temporary files..."
find . -name "*.tmp" -delete
find . -name "*.temp" -delete
find . -name ".DS_Store" -delete
find . -name "Thumbs.db" -delete
find . -name "desktop.ini" -delete
print_success "System temporary files cleaned"

# 7. AI/ML model cache (if any)
print_status "Cleaning AI model cache..."
if [[ -d ".cache/huggingface" ]]; then
    rm -rf .cache/huggingface/
    print_success "Hugging Face cache cleaned"
fi

if [[ -d ".cache/torch" ]]; then
    rm -rf .cache/torch/
    print_success "PyTorch cache cleaned"
fi

# 8. Hive-mind session cleanup (preserve main database)
print_status "Cleaning hive-mind session files..."
if [[ -d ".hive-mind/sessions" ]]; then
    find .hive-mind/sessions/ -name "*.json" -mtime +7 -delete
    print_success "Old hive-mind sessions cleaned (>7 days)"
fi

# 9. Claude-flow metrics cleanup
print_status "Cleaning metrics files..."
if [[ -d ".claude-flow/metrics" ]]; then
    # Keep recent metrics, clean old ones
    find .claude-flow/metrics/ -name "*.json" -mtime +30 -delete
    print_success "Old metrics cleaned (>30 days)"
fi

# 10. Test artifacts
print_status "Cleaning test artifacts..."
rm -rf test-results/
rm -rf playwright-report/
rm -rf screenshots/
find . -name "*.coverage" -delete
print_success "Test artifacts cleaned"

# 11. Backup and version files
print_status "Cleaning backup files..."
find . -name "*.backup" -delete
find . -name "*.bak" -delete
find . -name "*.old" -delete
find . -name "*.orig" -delete
find . -name "*~" -delete
print_success "Backup files cleaned"

# 12. Package manager artifacts
print_status "Cleaning package manager files..."
rm -f package-lock.json.backup
rm -f yarn-error.log
rm -f npm-debug.log*
rm -f .pnpm-debug.log
print_success "Package manager artifacts cleaned"

# 13. IDE and editor files (except important configs)
print_status "Cleaning IDE temporary files..."
find . -name ".vscode/settings.json.backup" -delete
find . -name "*.swp" -delete
find . -name "*.swo" -delete
print_success "IDE temporary files cleaned"

# 14. Generate cleanup report
print_status "Generating cleanup report..."
freed_space=$(du -sh . 2>/dev/null | cut -f1 || echo "unknown")

cat > cleanup-report.txt << EOF
Short Video Maker - Cleanup Report
Generated: $(date)

🧹 Cleaned Items:
- Node.js build artifacts and cache
- TypeScript compilation cache  
- Remotion rendering cache
- FramePack temporary and output files
- Video processing cache and temp files
- Log files and debugging output
- System temporary files
- AI/ML model cache
- Old hive-mind session files (>7 days)
- Old metrics data (>30 days)
- Test artifacts and coverage reports
- Backup and version files
- Package manager artifacts
- IDE temporary files

📊 Project Status After Cleanup:
- Project size: $freed_space
- Temporary files removed
- Cache cleared
- Ready for fresh builds

🚀 Next Steps:
- Run 'npm install' if needed
- Run 'npm run build' to rebuild
- Run 'npm test' to verify everything works
- Consider running './scripts/optimize-project.sh' for full optimization

EOF

print_success "Cleanup report generated: cleanup-report.txt"

# Final summary
echo ""
echo "✨ Short Video Maker cleanup completed!"
echo "📊 Project is now clean and optimized"
echo "📁 Check cleanup-report.txt for details"
echo "🚀 Ready for fresh development or deployment!"
echo ""
echo "💡 Recommended next steps:"
echo "   1. npm install (if dependencies were affected)"
echo "   2. npm run build (to rebuild the project)"
echo "   3. npm test (to verify everything works)"
echo "   4. ./scripts/optimize-project.sh (for full optimization)"