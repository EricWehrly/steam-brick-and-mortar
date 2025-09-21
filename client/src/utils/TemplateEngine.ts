/**
 * Simple template utility for HTML templates with dynamic value interpolation
 */

export interface TemplateValues {
    [key: string]: string | number | boolean | undefined
}

/**
 * Replace template placeholders with actual values
 * Supports:
 * - {{value}} - simple interpolation
 * - {{#if condition}}content{{/if}} - conditional blocks
 * - {{#if condition}}content{{else}}alternative{{/if}} - conditional with else
 * - {{#selected value}}selected{{/selected}} - selected attribute helper
 * - {{#checked value}}checked{{/checked}} - checked attribute helper
 */
export function interpolateTemplate(template: string, values: TemplateValues): string {
    let result = template

    // Handle conditional blocks with else FIRST: {{#if condition}}content{{else}}alternative{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, ifContent, elseContent) => {
        const value = values[key]
        return value ? (ifContent || '') : (elseContent || '')
    })

    // Handle conditional blocks without else: {{#if condition}}content{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
        const value = values[key]
        return value ? (content || '') : ''
    })

    // Handle selected attribute helper {{#selected value}}selected{{/selected}}
    result = result.replace(/\{\{#selected\s+(\w+)\}\}([\s\S]*?)\{\{\/selected\}\}/g, (match, key, content) => {
        const value = values[key]
        return value ? content : ''
    })

    // Handle checked attribute helper {{#checked value}}checked{{/checked}}
    result = result.replace(/\{\{#checked\s+(\w+)\}\}([\s\S]*?)\{\{\/checked\}\}/g, (match, key, content) => {
        const value = values[key]
        return value ? content : ''
    })

    // Handle simple interpolation LAST: {{value}}
    result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = values[key]
        return value !== undefined ? String(value) : ''
    })

    return result
}

/**
 * Load and interpolate a template
 */
export function renderTemplate(template: string, values: TemplateValues): string {
    return interpolateTemplate(template, values)
}
