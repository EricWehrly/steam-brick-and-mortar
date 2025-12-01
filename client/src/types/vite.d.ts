// Type declarations for Vite raw imports
declare module '*.html?raw' {
    const content: string
    export default content
}

declare module '*.txt?raw' {
    const content: string
    export default content
}

declare module '*.md?raw' {
    const content: string
    export default content
}

declare module '*.vert?raw' {
    const content: string
    export default content
}

declare module '*.frag?raw' {
    const content: string
    export default content
}

declare module '*.glsl?raw' {
    const content: string
    export default content
}

// Type declarations for Vite worker imports
declare module '*?worker' {
    const WorkerConstructor: {
        new (): Worker
    }
    export default WorkerConstructor
}
