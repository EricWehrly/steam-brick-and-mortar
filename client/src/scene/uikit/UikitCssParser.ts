/**
 * Digests plain CSS into entries for uikit's StyleSheet registry, so a uikit surface's appearance
 * lives in a real .css file instead of TypeScript object literals. Generic - knows nothing about
 * any particular menu; VRMenuStyleSheet.ts is the one that feeds it the VR menu's stylesheet.
 *
 * Deliberately a strict subset, because uikit isn't a browser and most of CSS has no meaning here:
 *
 *   - Selectors are single class selectors (`.vr-menu-root`), optionally comma-grouped. No
 *     combinators, pseudo-classes, ids, nesting or at-rules.
 *   - `:root { --name: value }` declares constants; `var(--name)` reads them, and falls back to
 *     the caller's resolver (tokens.css color tokens) for names the file doesn't declare.
 *   - Property names are kebab-case CSS spellings of uikit's own camelCase properties, passed
 *     through verbatim: `flex-direction` -> flexDirection, and also uikit-only ones with no CSS
 *     equivalent (`depth-test`, `render-order`). Values are not validated against uikit's schema.
 *   - `12px` and `12` both become the number 12: uikit-px are unitless, scaled to world-meters by
 *     the root's pixelSize, so `px` here is notation, not a real unit. `%` stays a string.
 *   - `border-radius` expands to the four corner properties uikit actually has.
 *
 * Anything outside that subset throws at parse time instead of being ignored - a silently dropped
 * declaration is an invisible styling bug, and the shipped stylesheet is covered by a test so a
 * throw can't reach a user.
 */

export type UikitStyleValue = string | number | boolean
export type UikitStyleEntries = Record<string, Record<string, UikitStyleValue>>

type ExternalVarResolver = (cssVarName: string) => string | undefined

const CLASS_SELECTOR = /^\.([A-Za-z_][\w-]*)$/
const VAR_REFERENCE = /var\(\s*(--[\w-]+)\s*\)/g
const NUMERIC_VALUE = /^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/
const MAX_VAR_DEPTH = 16

const BORDER_RADIUS_CORNERS = [
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius'
] as const

interface RawRule {
    readonly selectors: readonly string[]
    readonly declarations: ReadonlyArray<readonly [property: string, value: string]>
}

export function parseUikitCss(css: string, resolveExternalVar?: ExternalVarResolver): UikitStyleEntries {
    const rules = readRules(css)
    const variables = collectVariables(rules)
    const entries: UikitStyleEntries = {}

    for (const rule of rules) {
        if (rule.selectors.includes(':root')) {
            continue
        }
        const resolved = rule.declarations.flatMap(([property, value]) =>
            expandDeclaration(property, resolveValue(value, variables, resolveExternalVar))
        )
        for (const selector of rule.selectors) {
            const className = classNameOf(selector)
            entries[className] = { ...entries[className], ...Object.fromEntries(resolved) }
        }
    }

    return entries
}

function readRules(css: string): RawRule[] {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const rules: RawRule[] = []
    const block = /([^{}]+)\{([^{}]*)\}/g

    let consumedTo = 0
    let match: RegExpExecArray | null
    while ((match = block.exec(source)) !== null) {
        assertOnlyWhitespace(source.slice(consumedTo, match.index), 'text outside a rule')
        consumedTo = block.lastIndex

        const selectors = match[1].split(',').map(selector => selector.trim())
        for (const selector of selectors) {
            if (selector.startsWith('@')) {
                throw new Error(`Unsupported at-rule "${selector}" - uikit stylesheets have no at-rules`)
            }
        }
        rules.push({ selectors, declarations: readDeclarations(match[2], selectors.join(', ')) })
    }
    assertOnlyWhitespace(source.slice(consumedTo), 'an unterminated or nested block')

    return rules
}

function readDeclarations(body: string, selectorForErrors: string): RawRule['declarations'] {
    return body
        .split(';')
        .map(declaration => declaration.trim())
        .filter(declaration => declaration.length > 0)
        .map(declaration => {
            const colon = declaration.indexOf(':')
            if (colon < 1) {
                throw new Error(`Malformed declaration "${declaration}" in ${selectorForErrors}`)
            }
            return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as const
        })
}

function collectVariables(rules: readonly RawRule[]): Map<string, string> {
    const variables = new Map<string, string>()
    for (const rule of rules) {
        if (!rule.selectors.includes(':root')) {
            continue
        }
        if (rule.selectors.length > 1) {
            throw new Error(':root cannot be grouped with other selectors')
        }
        for (const [property, value] of rule.declarations) {
            if (!property.startsWith('--')) {
                throw new Error(`:root may only declare custom properties, found "${property}"`)
            }
            variables.set(property, value)
        }
    }
    return variables
}

function classNameOf(selector: string): string {
    const match = CLASS_SELECTOR.exec(selector)
    if (!match) {
        throw new Error(`Unsupported selector "${selector}" - only single class selectors like ".vr-menu-root" are supported`)
    }
    return match[1]
}

function resolveValue(raw: string, variables: ReadonlyMap<string, string>, external: ExternalVarResolver | undefined): string {
    let value = raw
    for (let depth = 0; value.includes('var('); depth++) {
        if (depth >= MAX_VAR_DEPTH) {
            throw new Error(`var() nesting too deep, or malformed, resolving "${raw}"`)
        }
        value = value.replace(VAR_REFERENCE, (_whole, name: string) => {
            const resolved = variables.get(name) ?? external?.(name)
            if (resolved === undefined) {
                throw new Error(`Unknown custom property ${name} in "${raw}"`)
            }
            return resolved
        })
    }
    return value
}

function expandDeclaration(property: string, value: string): Array<[string, UikitStyleValue]> {
    if (property.startsWith('--')) {
        throw new Error(`Custom property ${property} is only allowed inside :root`)
    }

    const converted = convertValue(value)
    if (property === 'border-radius') {
        return BORDER_RADIUS_CORNERS.map(corner => [corner, converted])
    }
    return [[toCamelCase(property), converted]]
}

function convertValue(value: string): UikitStyleValue {
    if (NUMERIC_VALUE.test(value)) {
        return parseFloat(value)
    }
    if (value === 'true') {
        return true
    }
    if (value === 'false') {
        return false
    }
    return value
}

function toCamelCase(property: string): string {
    return property.replace(/-([a-z])/g, (_whole, letter: string) => letter.toUpperCase())
}

function assertOnlyWhitespace(text: string, what: string): void {
    if (text.trim().length > 0) {
        throw new Error(`Unsupported CSS: found ${what}: "${text.trim().slice(0, 40)}"`)
    }
}
