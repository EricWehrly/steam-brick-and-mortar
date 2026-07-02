/**
 * Declarative UI component configuration utilities
 * 
 * Reduces 30-60 lines of repetitive DOM event handling per panel to ~10-20 lines
 * of type-safe configuration objects.
 * 
 * Pattern: Use .bind(this) for direct method references, arrow functions for logic blocks.
 * 
 * @example Basic slider with live value display
 * UIComponentUtils.setupSlider(container, {
 *   sliderId: 'fov',
 *   valueDisplayId: 'fov-value',
 *   formatDisplay: (v) => v + '°',
 *   onChange: (v) => { camera.fov = v; camera.updateProjectionMatrix() }
 * })
 * 
 * @example Button with bound method (preferred for simple calls)
 * UIComponentUtils.setupButton(container, {
 *   buttonId: 'reset-btn',
 *   onClick: this.resetToDefaults.bind(this)
 * })
 * 
 * @example Preset buttons using data attributes
 * UIComponentUtils.setupDataButtons(container, '[data-preset]', 'preset',
 *   (key: string) => this.applyPreset(PRESETS[key])
 * )
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
    onInput?: (value: T) => void
    onChange?: (value: T) => void
    parseValue?: (rawValue: string) => T
}

export interface TableColumnConfig<TRow> {
    key: string
    renderCell: (row: TRow) => string
}

export interface TableRenderConfig<TRow> {
    tbodyId: string
    rows: ReadonlyArray<TRow>
    columns: ReadonlyArray<TableColumnConfig<TRow>>
    rowClassName?: (row: TRow) => string | undefined
}

export class UIComponentUtils {
    static setupSlider(
        container: HTMLElement | null,
        config: SliderConfig
    ): void {
        if (!container) return

        const slider = container.querySelector(`#${config.sliderId}`) as HTMLInputElement
        const valueDisplay = container.querySelector(`#${config.valueDisplayId}`) as HTMLSpanElement

        if (!slider) return

        const followsThumb = valueDisplay?.hasAttribute('data-follows-thumb') ?? false
        const labelsGroup = container.querySelector(`#${config.sliderId}-labels`) as HTMLElement | null

        const updateDisplay = (value: number) => {
            if (valueDisplay) {
                valueDisplay.textContent = config.formatDisplay
                    ? config.formatDisplay(value)
                    : value.toString()

                if (followsThumb) {
                    const min = parseFloat(slider.min)
                    const max = parseFloat(slider.max)
                    const percent = ((value - min) / (max - min)) * 100
                    valueDisplay.style.left = `${percent}%`
                }
            }

            if (labelsGroup) {
                UIComponentUtils.highlightActiveStepLabel(labelsGroup, slider, value)
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

    /** Configure buttons using data attributes (useful for presets/dynamic groups) */
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

    static setupDelegatedDataButtons<T = string>(
        container: HTMLElement | null,
        selector: string,
        dataAttribute: string,
        onClick: (value: T, button: HTMLElement) => void
    ): void {
        if (!container) return

        container.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null
            const button = target?.closest(selector) as HTMLElement | null
            if (!button) {
                return
            }

            const value = button.dataset[dataAttribute] as T | undefined
            if (value === undefined) {
                return
            }

            onClick(value, button)
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

        if (!config.onInput && !config.onChange) return

        if (config.onInput) {
            input.addEventListener('input', (e) => {
                const rawValue = (e.target as HTMLInputElement).value
                const value = config.parseValue ? config.parseValue(rawValue) : rawValue as T
                config.onInput?.(value)
            })
        }

        if (config.onChange) {
            input.addEventListener('change', (e) => {
                const rawValue = (e.target as HTMLInputElement).value
                const value = config.parseValue ? config.parseValue(rawValue) : rawValue as T
                config.onChange?.(value)
            })
        }
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

            if (slider && valueDisplay.hasAttribute('data-follows-thumb')) {
                const min = parseFloat(slider.min)
                const max = parseFloat(slider.max)
                const percent = ((value - min) / (max - min)) * 100
                valueDisplay.style.left = `${percent}%`
            }
        }

        const labelsGroup = container.querySelector(`#${sliderId}-labels`) as HTMLElement | null
        if (slider && labelsGroup) {
            UIComponentUtils.highlightActiveStepLabel(labelsGroup, slider, value)
        }
    }

    private static highlightActiveStepLabel(
        labelsGroup: HTMLElement,
        slider: HTMLInputElement,
        value: number
    ): void {
        const min = parseFloat(slider.min)
        const activeIndex = Math.round(value - min)
        const labels = labelsGroup.querySelectorAll('span')
        labels.forEach((label, index) => {
            label.classList.toggle('slider-label-active', index === activeIndex)
        })
    }

    static renderTable<TRow>(
        container: HTMLElement | null,
        config: TableRenderConfig<TRow>
    ): void {
        if (!container) return

        const tbody = container.querySelector(`#${config.tbodyId}`) as HTMLElement | null
        if (!tbody) return

        tbody.innerHTML = config.rows.map((row) => {
            const rowClass = config.rowClassName?.(row)
            const classAttr = rowClass ? ` class="${rowClass}"` : ''
            const cells = config.columns
                .map((column) => `<td data-table-col="${column.key}">${column.renderCell(row)}</td>`)
                .join('')

            return `<tr${classAttr}>${cells}</tr>`
        }).join('')
    }
}
