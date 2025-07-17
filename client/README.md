# Steam Brick and Mortar - WebXR Client

A TypeScript-based WebXR application for browsing and launching Steam games in VR.

## Quick Start

```bash
# Install dependencies
yarn install

# Start development server
yarn serve

# Build for production
yarn build

# Run tests
yarn test
```

## Development Scripts

- `yarn dev` / `yarn serve` - Start development server with hot reload
- `yarn build` - Build production bundle
- `yarn preview` - Preview production build locally

### Testing Commands

- `yarn test` - Run unit and integration tests
- `yarn test:watch` - Run tests in watch mode
- `yarn test:ui` - Run tests with UI
- `yarn test:performance` - Run performance tests (slower, separate from unit tests)
- `yarn test:live` - Run live integration tests (requires API access)
- `yarn test:all` - Run all tests including live tests
- `yarn test:everything` - Run all tests including performance tests

### Code Quality

- `yarn lint` - Check code for issues
- `yarn lint:fix` - Fix automatically fixable issues
- `yarn clean` - Clean build artifacts and dependencies
- `yarn type-check` - Type check without building

## Project Structure

```
client/
├── src/
│   ├── main.ts              # Main application entry point
│   └── webxr.d.ts          # WebXR type definitions
├── test/
│   ├── setup.ts            # Test environment setup
│   └── hello-world.test.ts # Basic functionality tests
├── public/                 # Static assets
├── index.html             # HTML entry point
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build configuration
├── vitest.config.ts       # Test configuration
└── eslint.config.js       # Linting rules
```

## Technology Stack

- **TypeScript** - Type-safe JavaScript development
- **Three.js** - 3D graphics and WebXR integration
- **Vite** - Fast development server and build tool
- **Vitest** - Unit testing framework
- **ESLint** - Code quality and issue detection
- **Yarn PnP** - Fast, reliable package management

## WebXR Features

- Cross-platform VR support (Meta Quest, SteamVR, etc.)
- Progressive enhancement (works without VR hardware)
- Desktop 3D mode with mouse/keyboard controls
- WebXR session management and error handling

## Development Guidelines

- Non-strict TypeScript mode for faster development
- ESLint focused on catching real issues, not style
- Progressive implementation (3D scene → VR → Steam integration)
- Test-driven development with comprehensive test coverage

## Browser Support

- **Desktop**: Chrome/Edge (WebXR support), Firefox (experimental)
- **VR Headsets**: Meta Quest Browser, SteamVR, other WebXR-compatible browsers
- **Fallback**: 3D desktop mode for non-VR browsers
