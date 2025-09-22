/**
 * Global Toast Notification Manager
 * 
 * Provides application-wide toast notifications that appear as temporary
 * overlays. Replaces alert() calls with better UX.
 */

export interface ToastOptions {
    duration?: number // milliseconds, default 4000
    position?: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center'
}

export type ToastType = 'success' | 'error' | 'info' | 'warning'

// TODO: queuing system to ensure toasts don't flood the screen
export class ToastManager {
    private static instance: ToastManager | null = null
    private container: HTMLElement | null = null
    private toastCounter = 0

    private constructor() {
        this.createContainer()
    }

    private static getInstance(): ToastManager {
        if (!ToastManager.instance) {
            ToastManager.instance = new ToastManager()
        }
        return ToastManager.instance
    }

    // Static convenience methods - no need to access instance
    static success(message: string, options: ToastOptions = {}): void {
        ToastManager.getInstance().show(message, 'success', options)
    }

    static error(message: string, options: ToastOptions = {}): void {
        ToastManager.getInstance().show(message, 'error', { duration: 6000, ...options })
    }

    static info(message: string, options: ToastOptions = {}): void {
        ToastManager.getInstance().show(message, 'info', options)
    }

    static warning(message: string, options: ToastOptions = {}): void {
        ToastManager.getInstance().show(message, 'warning', options)
    }

    private createContainer(): void {
        if (this.container) return

        // Only create container if we have a valid DOM environment
        if (typeof document === 'undefined' || !document.body) {
            console.warn('ToastManager: DOM not available, toast notifications disabled')
            return
        }

        this.container = document.createElement('div')
        this.container.id = 'toast-container'
        this.container.className = 'toast-container'
        document.body.appendChild(this.container)
    }

    private show(message: string, type: ToastType = 'info', options: ToastOptions = {}): void {
        if (!this.container) {
            this.createContainer()
        }

        // If container still doesn't exist (DOM not available), fall back to console
        if (!this.container) {
            console.log(`Toast (${type}): ${message}`)
            return
        }

        const toast = this.createToast(message, type, options)
        this.container.appendChild(toast)

        // Trigger enter animation
        setTimeout(() => {
            toast.classList.add('toast-enter')
        }, 10)

        // Auto-remove after duration
        const duration = options.duration ?? 4000
        setTimeout(() => {
            this.removeToast(toast)
        }, duration)
    }
    
    private createToast(message: string, type: ToastType, options: ToastOptions): HTMLElement {
        const toast = document.createElement('div')
        toast.className = `toast toast-${type}`
        toast.dataset.id = (++this.toastCounter).toString()

        // Toast content
        const content = document.createElement('div')
        content.className = 'toast-content'
        content.textContent = message

        // Close button
        const closeBtn = document.createElement('button')
        closeBtn.className = 'toast-close'
        closeBtn.innerHTML = '×'
        closeBtn.onclick = () => this.removeToast(toast)

        toast.appendChild(content)
        toast.appendChild(closeBtn)

        return toast
    }

    private removeToast(toast: HTMLElement): void {
        toast.classList.remove('toast-enter')
        toast.classList.add('toast-exit')
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast)
            }
            // Let CSS handle container visibility based on content
        }, 5000) // Match CSS transition duration
    }

    dispose(): void {
        if(this.container) this.container.innerHTML = '';

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container)
        }
        this.container = null
        ToastManager.instance = null
    }
}