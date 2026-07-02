/**
 * Canonical settings-row control hierarchy.
 *
 * Each subclass renders a string (no DOM ownership, no persisted instances) —
 * panels call `new RangeControl({...}).render()` from their own `render()` method
 * and wire behavior afterward via `UIComponentUtils`, exactly as a flat template
 * string would have been used.
 *
 * The row shell, label, hint badge, and description are managed uniformly here;
 * subclasses only ever contribute `renderControl()`.
 */

export type UIComponentHintKind = 'instant' | 'reload' | 'disabled'

export interface UIComponentHint {
    readonly text: string
    readonly kind: UIComponentHintKind
}

export interface UIComponentOptions {
    readonly id: string
    readonly label?: string
    /** Trusted HTML rendered inline after the label text (e.g. a live-updating VRAM estimate span). */
    readonly labelExtra?: string
    readonly hint?: UIComponentHint
    readonly description?: string
    readonly disabled?: boolean
    readonly requiresReload?: boolean
}

export abstract class UIComponent<TOpts extends UIComponentOptions = UIComponentOptions> {
    constructor(protected readonly opts: TOpts) {}

    render(): string {
        const disabledClass = this.opts.disabled ? ' disabled-setting' : ''
        return `<div class="ui-component-row${disabledClass}">
            ${this.renderLabel()}
            <div class="ui-component-control">${this.renderControl()}${this.renderHint()}</div>
            ${this.renderDescription()}
        </div>`
    }

    protected renderLabel(): string {
        if (!this.opts.label) return ''
        const extra = this.opts.labelExtra ? ` ${this.opts.labelExtra}` : ''
        return `<label class="ui-component-label" for="${this.opts.id}">${this.opts.label}${extra}</label>`
    }

    protected renderDescription(): string {
        return this.opts.description
            ? `<p class="ui-component-description">${this.opts.description}</p>`
            : ''
    }

    protected renderHint(): string {
        if (!this.opts.hint) return ''
        return `<span class="setting-hint-badge hint-${this.opts.hint.kind}">${this.opts.hint.text}</span>`
    }

    protected abstract renderControl(): string

    protected renderDisabledAttr(): string {
        return this.opts.disabled ? ' disabled' : ''
    }

    protected renderRequiresReloadAttr(): string {
        return this.opts.requiresReload ? ' data-requires-reload' : ''
    }
}

export interface RangeControlOptions extends UIComponentOptions {
    readonly min: number
    readonly max: number
    readonly step: number
    readonly value: number
    readonly formatDisplay?: (value: number) => string
    /** Labels distributed evenly under the track (e.g. min/max, or named steps like "Off"/"Low"/.../"Ultra"). */
    readonly trackLabels?: readonly string[]
    /** Overrides the value-bubble element id (default: `${id}-value`) for legacy id compatibility. */
    readonly valueId?: string
}

export class RangeControl extends UIComponent<RangeControlOptions> {
    protected renderControl(): string {
        const { id, min, max, step, value, formatDisplay, trackLabels, valueId } = this.opts
        const displayValue = formatDisplay ? formatDisplay(value) : String(value)
        const thumbPercent = ((value - min) / (max - min)) * 100
        const valueSpanId = valueId ?? `${id}-value`

        // A range whose trackLabels enumerate every integer step (e.g. Off/Low/Medium/High/Ultra)
        // reads better as a highlighted label than a floating value bubble duplicating the same text.
        const isDiscrete = step === 1 && !!trackLabels && trackLabels.length === max - min + 1

        const trackLabelsRow = trackLabels
            ? `<div class="slider-labels"${isDiscrete ? ` id="${id}-labels" data-discrete-labels` : ''}>${trackLabels
                  .map((label, index) => {
                      const isActive = isDiscrete && index === Math.round(value - min)
                      return `<span${isActive ? ' class="slider-label-active"' : ''}>${label}</span>`
                  })
                  .join('')}</div>`
            : ''

        const valueBubble = isDiscrete
            ? ''
            : `<span id="${valueSpanId}" class="ui-range-value-bubble" data-follows-thumb style="left: ${thumbPercent}%">${displayValue}</span>`

        return `<div class="ui-range-control">
            <div class="ui-range-track-row">
                <input
                    type="range"
                    id="${id}"
                    class="setting-slider pause-slider ui-range-input"
                    min="${min}"
                    max="${max}"
                    step="${step}"
                    value="${value}"${this.renderDisabledAttr()}${this.renderRequiresReloadAttr()}
                >
                ${valueBubble}
            </div>
            ${trackLabelsRow}
        </div>`
    }
}

export interface SelectControlOption {
    readonly value: string
    readonly label: string
    readonly selected?: boolean
}

export interface SelectControlOptions extends UIComponentOptions {
    readonly options: readonly SelectControlOption[]
}

export class SelectControl extends UIComponent<SelectControlOptions> {
    protected renderControl(): string {
        const { id, options } = this.opts
        const optionsHtml = options
            .map((option) => `<option value="${option.value}"${option.selected ? ' selected' : ''}>${option.label}</option>`)
            .join('')

        return `<select
            id="${id}"
            class="setting-select pause-select ui-select-input"${this.renderDisabledAttr()}${this.renderRequiresReloadAttr()}
        >${optionsHtml}</select>`
    }
}
