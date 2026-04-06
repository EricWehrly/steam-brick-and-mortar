import './ui-checkbox.css';

export interface UICheckboxOptions {
    label: string;
    checked?: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export class UICheckbox {
    /**
     * Creates a styled checkbox element with a label.
     * Returns a wrapper div containing input[type=checkbox] + label.
     */
    static create(options: UICheckboxOptions): HTMLElement {
        const { label, checked = false, onChange, disabled = false } = options;

        const container = document.createElement('div');
        container.classList.add('ui-checkbox-container');
        if (disabled) {
            container.classList.add('ui-checkbox-container--disabled');
        }

        const labelElement = document.createElement('label');
        labelElement.classList.add('ui-checkbox-label');

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.classList.add('ui-checkbox-input');
        input.checked = checked;
        input.disabled = disabled;

        const customCheckbox = document.createElement('span');
        customCheckbox.classList.add('ui-checkbox-custom');

        const labelText = document.createElement('span');
        labelText.classList.add('ui-checkbox-text');
        labelText.textContent = label;

        input.addEventListener('change', () => {
            onChange(input.checked);
        });

        labelElement.appendChild(input);
        labelElement.appendChild(customCheckbox);
        labelElement.appendChild(labelText);
        container.appendChild(labelElement);

        return container;
    }
}
