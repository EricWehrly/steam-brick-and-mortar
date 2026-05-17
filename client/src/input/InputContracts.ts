export interface InputState {
    keys: {
        w: boolean
        a: boolean
        s: boolean
        d: boolean
        q: boolean
        e: boolean
        space: boolean
        c: boolean
    }
    mouse: {
        down: boolean
        x: number
        y: number
    }
}

export interface InputCallbacks {
    onKeyPress?: (key: string) => void
    onKeyRelease?: (key: string) => void
}

export interface MovementOptions {
    speed: number
    mouseSensitivity: number
    sprintMultiplier: number
}

export type InputKey = keyof InputState['keys']

export const KEY_CODE_TO_INPUT_KEY: Readonly<Record<string, InputKey>> = {
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
    KeyQ: 'q',
    KeyE: 'e',
    Space: 'space',
    KeyC: 'c'
}
