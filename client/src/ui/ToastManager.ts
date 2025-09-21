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

export class ToastManager {
    private static instance: ToastManager | null = null
    private container: HTMLElement | null = null
    private toastCounter = 0

    private constructor() {
        this.createContainer()
    }

    /**
     * Get singleton instance
     */
    static getInstance(): ToastManager {
        if (!ToastManager.instance) {
            ToastManager.instance = new ToastManager()
        }
        return ToastManager.instance
    }

    /**
     * Create the toast container if it doesn't exist
     */
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

    /**
     * Show a toast notification
     */
    show(message: string, type: ToastType = 'info', options: ToastOptions = {}): void {
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

    /**
     * Show success toast
     */
    success(message: string, options: ToastOptions = {}): void {
        this.show(message, 'success', options)
    }

    /**
     * Show error toast
     */
    error(message: string, options: ToastOptions = {}): void {
        this.show(message, 'error', { duration: 6000, ...options })
    }

    /**
     * Show info toast
     */
    info(message: string, options: ToastOptions = {}): void {
        this.show(message, 'info', options)
    }

    /**
     * Show warning toast
     */
    warning(message: string, options: ToastOptions = {}): void {
        this.show(message, 'warning', options)
    }

    /**
     * Create a toast element
     */
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

    /**
     * Remove a toast with exit animation
     */
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

    /**
     * Clear all toasts
     */
    clear(): void {
        if (this.container) {
            this.container.innerHTML = ''
        }
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.clear()
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container)
        }
        this.container = null
        ToastManager.instance = null
    }
}