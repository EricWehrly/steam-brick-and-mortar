/**
 * Validates and builds the manual-export bookmarklet in public/bookmarklets/.
 *
 * Why this exists: a javascript: bookmarklet is stored as a browser bookmark, and many
 * browsers flatten a multi-line bookmark URL to a single line when it's dragged to the
 * bookmarks bar. A `//` line comment then has no real newline left to end it at, and
 * swallows everything after it — producing a syntactically broken script that fails with
 * "Unexpected end of input" only once installed, never on the readable multi-line source.
 * Confirmed live 2026-07-03.
 *
 * TypeScript's transpiler (already a project dependency, used for `tsc` everywhere else)
 * parses the file for real and strips comments correctly — distinguishing an actual `//`
 * comment from the same two characters appearing inside a string literal (e.g.
 * 'https://steamcommunity.com/...'), which a naive regex-based stripper would get wrong.
 * `reportDiagnostics` and `removeComments` are independent compiler options, so one
 * transpileModule call both validates and produces the comment-free output.
 *
 * export-library.user.js (Tampermonkey/Violentmonkey packaging) is intentionally not part
 * of this build — a "could have been" for a use case we don't expect to hit. Left in place,
 * untouched, not wired into the UI.
 *
 * Run: yarn build:bookmarklets (from client/)
 */
import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.join(__dirname, '..', 'public', 'bookmarklets', 'export-library.js')
const outputPath = path.join(__dirname, '..', 'public', 'bookmarklets', 'export-library.min.js')

try {
    const result = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, removeComments: true },
        reportDiagnostics: true
    })
    if (result.diagnostics?.length) {
        const messages = result.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
        throw new Error(`export-library.js failed to parse:\n${messages.join('\n')}`)
    }
    writeFileSync(outputPath, result.outputText)
    console.log(`✓ export-library.min.js written (${result.outputText.length} bytes, comment-free)`)
} catch (error) {
    console.error('✗', error.message)
    process.exit(1)
}
