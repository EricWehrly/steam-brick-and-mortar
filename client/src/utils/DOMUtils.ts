/**
 * DOM manipulation and event handling utilities
 */

export class DOMUtils {
    /**
     * Safely get an element by ID with type casting
     */
    static getElementById<T extends HTMLElement = HTMLElement>(id: string): T | null {
        return document.getElementById(id) as T | null
    }

    /**
     * Safely get an input element by ID
     */
    static getInputElement(id: string): HTMLInputElement | null {
        return this.getElementById<HTMLInputElement>(id)
    }

    /**
     * Safely get a button element by ID
     */
    static getButtonElement(id: string): HTMLButtonElement | null {
        return this.getElementById<HTMLButtonElement>(id)
    }

    /**
     * Set element display style
     */
    static setDisplay(element: HTMLElement | null, display: string): void {
        if (element) {
            element.style.display = display
        }
    }

    /**
     * Show element (set display to block)
     */
    static show(element: HTMLElement | null): void {
        this.setDisplay(element, 'block')
    }

    /**
     * Hide element (set display to none)
     */
    static hide(element: HTMLElement | null): void {
        this.setDisplay(element, 'none')
    }

    /**
     * Toggle element visibility
     */
    static toggle(element: HTMLElement | null): boolean {
        if (!element) return false
        
        const isHidden = element.style.display === 'none'
        element.style.display = isHidden ? 'block' : 'none'
        return !isHidden // Returns true if now visible
    }

    /**
     * Set element text content safely
     */
    static setText(element: HTMLElement | null, text: string): void {
        if (element) {
            element.textContent = text
        }
    }

    /**
     * Set element inner HTML safely
     */
    static setHTML(element: HTMLElement | null, html: string): void {
        if (element) {
            element.innerHTML = html
        }
    }

    /**
     * Add event listener with error handling
     */
    static addEventListener<K extends keyof HTMLElementEventMap>(
        element: HTMLElement | null,
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        if (element) {
            element.addEventListener(type, listener, options)
        }
    }

    /**
     * Set button disabled state
     */
    static setButtonDisabled(button: HTMLButtonElement | null, disabled: boolean): void {
        if (button) {
            button.disabled = disabled
        }
    }

    /**
     * Set input placeholder text
     */
    static setPlaceholder(input: HTMLInputElement | null, placeholder: string): void {
        if (input) {
            input.placeholder = placeholder
        }
    }

    /**
     * Get input value safely
     */
    static getInputValue(input: HTMLInputElement | null): string {
        return input?.value?.trim() || ''
    }
}

/**
 * Safely get an element by ID (functional approach)
 */
export function getElementByIdSafe<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null
}