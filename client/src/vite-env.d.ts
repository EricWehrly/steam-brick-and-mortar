/// <reference types="vite/client" />

// Ambient declarations for non-TS module side-effect imports (CSS, etc.)
// Required by TypeScript 6.0+ with moduleResolution: "bundler"
declare module '*.css' {
  const content: Record<string, string>
  export default content
}
declare module '*.svg' {
  const content: string
  export default content
}
declare module '*.png' {
  const content: string
  export default content
}
declare module '*.jpg' {
  const content: string
  export default content
}
declare module '*.glb' {
  const content: string
  export default content
}
declare module '*.gltf' {
  const content: string
  export default content
}
