export interface UIButtonOptions {
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary' | 'danger'
    /** If true, button renders as disabled */
    disabled?: boolean
}

export class UIButton {
    /**
     * Creates a styled HTML button element.
     * Uses design tokens from tokens.css for consistent styling.
     */
    static create(options: UIButtonOptions): HTMLButtonElement {
        const { label, onClick, variant = 'secondary', disabled = false } = options;

        const button = document.createElement('button');
        button.type = 'button';
        button.innerText = label;
        button.disabled = disabled;
        
        // Add base class and variant class
        button.classList.add('ui-button');
        button.classList.add(`ui-button--${variant}`);

        button.addEventListener('click', (e) => {
            if (!button.disabled) {
                onClick();
            }
        });

        return button;
    }
}
