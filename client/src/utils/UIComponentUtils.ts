/**
 * UI Component utilities for common interactive patterns
 * Reduces boilerplate for sliders, toggles, and other form controls
 */

export interface SliderConfig {
    sliderId: string
    valueDisplayId: string
    onInput?: (value: number) => void
    onChange?: (value: number) => void
    formatDisplay?: (value: number) => string
}

export interface ToggleConfig {
    toggleId: string
    onChange: (checked: boolean) => void
}

export interface ButtonConfig {
    buttonId: string
    onClick: () => void
}

export interface SelectConfig<T = string> {
    selectId: string
    onChange: (value: T) => void
    parseValue?: (rawValue: string) => T
}

export interface InputConfig<T = string> {
    inputId: string
    onChange: (value: T) => void
    parseValue?: (rawValue: string) => T
}

export class UIComponentUtils {
    /**
     * @example
     * setupSlider(container, {
     *   sliderId: 'fov-slider',
     *   valueDisplayId: 'fov-value',
     *   formatDisplay: (v) => v + '°',
     *   onChange: (v) => camera.fov = v
     * })
     */
    static setupSlider(
        container: HTMLElement | null,
        config: SliderConfig
    ): void {
        if (!container) return

        const slider = container.querySelector(`#${config.sliderId}`) as HTMLInputElement
        const valueDisplay = container.querySelector(`#${config.valueDisplayId}`) as HTMLSpanElement

        if (!slider) return

        const updateDisplay = (value: number) => {
            if (valueDisplay) {
                valueDisplay.textContent = config.formatDisplay 
                    ? config.formatDisplay(value)
                    : value.toString()
            }
        }

        if (config.onInput) {
            slider.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value)
                updateDisplay(value)
                if (config.onInput) {
                    config.onInput(value)
                }
            })
        } else {
            slider.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value)
                updateDisplay(value)
            })
        }

        if (config.onChange) {
            slider.addEventListener('change', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value)
                if (config.onChange) {
                    config.onChange(value)
                }
            })
        }
    }

    static setupSliders(
        container: HTMLElement | null,
        configs: SliderConfig[]
    ): void {
        configs.forEach(config => this.setupSlider(container, config))
    }

    static setupToggle(
        container: HTMLElement | null,
        config: ToggleConfig
    ): void {
        if (!container) return

        const toggle = container.querySelector(`#${config.toggleId}`) as HTMLInputElement
        if (!toggle) return

        toggle.addEventListener('change', (e) => {
            config.onChange((e.target as HTMLInputElement).checked)
        })
    }

    static setupToggles(
        container: HTMLElement | null,
        configs: ToggleConfig[]
    ): void {
        configs.forEach(config => this.setupToggle(container, config))
    }

    static setupButton(
        container: HTMLElement | null,
        config: ButtonConfig
    ): void {
        if (!container) return

        const button = container.querySelector(`#${config.buttonId}`) as HTMLButtonElement
        if (!button) return

        button.addEventListener('click', config.onClick)
    }

    static setupButtons(
        container: HTMLElement | null,
        configs: ButtonConfig[]
    ): void {
        configs.forEach(config => this.setupButton(container, config))
    }

    /**
     * Buttons with data attributes selector pattern (e.g., [data-preset="NORMAL"])
     */
    static setupDataButtons<T = string>(
        container: HTMLElement | null,
        selector: string,
        dataAttribute: string,
        onClick: (value: T, button: HTMLElement) => void
    ): void {
        if (!container) return

        const buttons = container.querySelectorAll(selector)
        buttons.forEach(button => {
            const value = (button as HTMLElement).dataset[dataAttribute] as T
            if (value !== undefined) {
                button.addEventListener('click', () => {
                    onClick(value, button as HTMLElement)
                })
            }
        })
    }

    static setupSelect<T = string>(
        container: HTMLElement | null,
        config: SelectConfig<T>
    ): void {
        if (!container) return

        const select = container.querySelector(`#${config.selectId}`) as HTMLSelectElement
        if (!select) return

        select.addEventListener('change', (e) => {
            const rawValue = (e.target as HTMLSelectElement).value
            const value = config.parseValue ? config.parseValue(rawValue) : rawValue as T
            config.onChange(value)
        })
    }

    static setupSelects<T = string>(
        container: HTMLElement | null,
        configs: SelectConfig<T>[]
    ): void {
        configs.forEach(config => this.setupSelect(container, config))
    }

    static setupInput<T = string>(
        container: HTMLElement | null,
        config: InputConfig<T>
    ): void {
        if (!container) return

        const input = container.querySelector(`#${config.inputId}`) as HTMLInputElement
        if (!input) return

        input.addEventListener('change', (e) => {
            const rawValue = (e.target as HTMLInputElement).value
            const value = config.parseValue ? config.parseValue(rawValue) : rawValue as T
            config.onChange(value)
        })
    }

    static setupInputs<T = string>(
        container: HTMLElement | null,
        configs: InputConfig<T>[]
    ): void {
        configs.forEach(config => this.setupInput(container, config))
    }

    static updateSliderValue(
        container: HTMLElement | null,
        sliderId: string,
        valueDisplayId: string,
        value: number,
        formatDisplay?: (value: number) => string
    ): void {
        if (!container) return

        const slider = container.querySelector(`#${sliderId}`) as HTMLInputElement
        const valueDisplay = container.querySelector(`#${valueDisplayId}`) as HTMLSpanElement

        if (slider) {
            slider.value = value.toString()
        }

        if (valueDisplay) {
            valueDisplay.textContent = formatDisplay 
                ? formatDisplay(value)
                : value.toString()
        }
    }
}
