# JavaScript/Node.js Development Guidelines

## Package Management
- **ALWAYS use Yarn PnP** for Node.js projects - it's much more performant than npm
- **Use `.yarnrc.yml`** with `nodeLinker: pnp` for Plug'n'Play mode
- **Never use npm install** - always use `yarn install` or `yarn add <package>`
- **Commit `.pnp.cjs` and `.yarn/`** directories for reproducible builds
- **Trust the established package manager** - if yarn.lock exists, use Yarn; if package-lock.json exists, use npm

If you run into issues running commands in the terminal, _read the terminal output_.
You have _very often_ thought commands broken because you did not check the working directory, and the error had to do with you being in a different directory than your commands expect.

## Code Style
- **Modern ES6+**: async/await patterns, arrow functions, destructuring
- **Clean Architecture**: Modular components, clear separation of concerns
- **Error Handling**: Proper try/catch blocks, meaningful error messages
- **Documentation**: Include setup/usage instructions in comments
- **Named Functions**: Avoid anonymous/unnamed functions - use named methods or function declarations for better stack traces and readability
- **No Magic Values**: Extract magic numbers and strings to named constants with clear semantic meaning
- **Meaningful Comments Only**: Avoid redundant comments that restate what well-named code already expresses

Examples:
```typescript
// ❌ BAD: Anonymous function, magic number
eventManager.registerEventHandler('progress', (event) => {
    if (progress > 0.9) { /* ... */ }
})

// ✅ GOOD: Named method, semantic constant
private readonly CACHED_BATCH_THRESHOLD = 0.9
eventManager.registerEventHandler('progress', this.handleProgress.bind(this))
```

## Testing
- **Test locally first**: Validate functionality before deploying
- **Mock external services**: Use environment variables for local development
- **Integration testing**: Test with real APIs when possible
- **Error scenarios**: Test failure modes and edge cases

## Environment Management
- **Use .env files** for local development
- **Environment detection**: Support both local and production environments
- **Secrets management**: Never commit API keys or sensitive data
- **Configuration**: Use environment variables for all configurable values
