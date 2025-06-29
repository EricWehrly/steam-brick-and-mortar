#!/bin/bash

# Steam Blockbuster Shelf VR - Setup Script
# WebXR-First Development Environment Setup
# Checks and installs prerequisites for Three.js + WebXR development

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "\n${BOLD}${BLUE}$1${NC}"; }

# Track what needs to be installed
MISSING_TOOLS=()
OPTIONAL_MISSING=()

log_header "🎮 Steam Blockbuster Shelf VR - Setup"
echo "Setting up WebXR-first development environment..."
echo

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node --version | sed 's/v//')
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
        if [ "$MAJOR_VERSION" -ge 16 ]; then
            log_success "Node.js $NODE_VERSION (meets minimum requirement: 16+)"
            return 0
        else
            log_warning "Node.js $NODE_VERSION (minimum required: 16+)"
            return 1
        fi
    else
        return 1
    fi
}

# Function to detect package manager
detect_package_manager() {
    if command_exists apt-get; then
        echo "apt"
    elif command_exists yum; then
        echo "yum"
    elif command_exists brew; then
        echo "brew"
    elif command_exists pacman; then
        echo "pacman"
    elif command_exists winget; then
        echo "winget"
    else
        echo "unknown"
    fi
}

# Function to install missing tools
install_missing_tools() {
    local pm=$(detect_package_manager)
    
    if [ ${#MISSING_TOOLS[@]} -eq 0 ]; then
        log_success "All required tools are already installed!"
        return 0
    fi
    
    log_header "🔧 Installing Missing Tools"
    
    for tool in "${MISSING_TOOLS[@]}"; do
        log_info "Installing $tool..."
        
        case $pm in
            apt)
                case $tool in
                    git) sudo apt-get update && sudo apt-get install -y git ;;
                    node) 
                        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
                        sudo apt-get install -y nodejs
                        ;;
                    *) log_warning "Don't know how to install $tool on this system" ;;
                esac
                ;;
            brew)
                case $tool in
                    git) brew install git ;;
                    node) brew install node@18 ;;
                    *) log_warning "Don't know how to install $tool on this system" ;;
                esac
                ;;
            winget)
                case $tool in
                    git) winget install Git.Git ;;
                    node) winget install OpenJS.NodeJS ;;
                    *) log_warning "Don't know how to install $tool on this system" ;;
                esac
                ;;
            *)
                log_warning "Unknown package manager. Please install $tool manually."
                ;;
        esac
    done
}

log_header "🔍 Checking Prerequisites"

# Check Git
if command_exists git; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    log_success "Git $GIT_VERSION"
else
    log_error "Git not found"
    MISSING_TOOLS+=("git")
fi

# Check Node.js
if check_node_version; then
    # Node.js is good, continue
    :
else
    log_error "Node.js 16+ not found"
    MISSING_TOOLS+=("node")
fi

# Check npm (comes with Node.js)
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    log_success "npm $NPM_VERSION"
else
    log_warning "npm not found (should come with Node.js)"
fi

# Check for preferred tools
log_header "🎯 Checking Preferred Tools"

# Check Yarn (preferred package manager)
if command_exists yarn; then
    YARN_VERSION=$(yarn --version)
    log_success "Yarn $YARN_VERSION (preferred package manager)"
else
    log_warning "Yarn not found (recommended for better performance)"
    OPTIONAL_MISSING+=("yarn")
fi

# Check Corepack (for modern Yarn)
if command_exists corepack; then
    log_success "Corepack available (enables modern Yarn)"
else
    log_warning "Corepack not found (recommended for Yarn PnP)"
    OPTIONAL_MISSING+=("corepack")
fi

# Check Docker (for containerized development)
if command_exists docker; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | sed 's/,//')
    log_success "Docker $DOCKER_VERSION"
else
    log_warning "Docker not found (optional, for containerized development)"
    OPTIONAL_MISSING+=("docker")
fi

# Check if we're in the right directory
log_header "📁 Checking Project Structure"

if [ -f "package.json" ] || [ -f "webxr-app/package.json" ]; then
    log_success "Found package.json - in correct project directory"
elif [ -f "README.md" ] && grep -q "Blockbuster Shelf" README.md 2>/dev/null; then
    log_success "Found project README - in correct directory"
else
    log_warning "May not be in the correct project directory"
    log_info "Expected to find package.json or project README"
fi

# Install missing tools if any
if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
    echo
    log_warning "Missing required tools: ${MISSING_TOOLS[*]}"
    read -p "Install missing tools automatically? (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_missing_tools
    else
        log_info "Please install the missing tools manually:"
        for tool in "${MISSING_TOOLS[@]}"; do
            echo "  • $tool"
        done
    fi
fi

# Offer to install optional tools
if [ ${#OPTIONAL_MISSING[@]} -gt 0 ]; then
    echo
    log_info "Optional recommended tools missing: ${OPTIONAL_MISSING[*]}"
    
    for tool in "${OPTIONAL_MISSING[@]}"; do
        case $tool in
            yarn)
                log_info "Install Yarn with: npm install -g yarn"
                ;;
            corepack)
                log_info "Enable Corepack with: corepack enable"
                ;;
            docker)
                log_info "Install Docker from: https://docker.com/get-started"
                ;;
        esac
    done
fi

# Final setup steps
log_header "🚀 Next Steps"

if [ ${#MISSING_TOOLS[@]} -eq 0 ]; then
    log_success "All required tools are installed!"
    echo
    log_info "Ready to start WebXR development. Next steps:"
    echo "  1. Create or navigate to webxr-app directory"
    echo "  2. Run: yarn install (or npm install)"
    echo "  3. Start development server"
    echo "  4. Open in WebXR-capable browser"
    echo
    log_info "For VR testing, connect a VR headset and ensure SteamVR or Oculus software is running"
else
    log_warning "Please install missing tools before proceeding"
fi

echo
log_info "Setup complete! 🎮"
