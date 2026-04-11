const { execSync } = require('child_process')

let out
try {
    out = execSync(
        'yarn --silent lint --format stylish',
        { cwd: __dirname + '/client', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
    )
} catch (e) {
    out = (e.stdout || '') + (e.stderr || '')
}

const counts = {}
let total = 0

for (const line of out.split('\n')) {
    // stylish format: "  line:col  warning  message  rule-id"
    const m = line.match(/\s+(warning|error)\s+.+?\s+([\w@/:-]+)\s*$/)
    if (m) {
        const rule = m[2]
        counts[rule] = (counts[rule] || 0) + 1
        total++
    }
}

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
console.log('Rule violations:')
for (const [r, n] of sorted) console.log(String(n).padStart(4), r)
console.log('---')
console.log('Total:', total)
