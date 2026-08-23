import { describe, expect, it } from 'vitest'
import { isLineChanged, parseUnifiedDiff } from '../src/diff.js'

const SAMPLE = `diff --git a/src/app.css b/src/app.css
index 111..222 100644
--- a/src/app.css
+++ b/src/app.css
@@ -10,0 +11,3 @@ .button {
+  color: #3b82f6;
+  padding: 13px;
+  margin: 1rem;
@@ -30,2 +33,0 @@ .card {
-  background: red;
-  border: none;
@@ -40 +41 @@ .other {
-  gap: 3px;
+  gap: 4px;
diff --git a/src/new.tsx b/src/new.tsx
new file mode 100644
--- /dev/null
+++ b/src/new.tsx
@@ -0,0 +1,2 @@
+export const x = 1
+export const y = 2
`

describe('parseUnifiedDiff', () => {
  it('collects added ranges per file', () => {
    const changed = parseUnifiedDiff(SAMPLE)
    expect(changed.get('src/app.css')).toEqual([
      { start: 11, end: 13 },
      { start: 41, end: 41 },
    ])
    expect(changed.get('src/new.tsx')).toEqual([{ start: 1, end: 2 }])
  })

  it('skips pure deletions', () => {
    const changed = parseUnifiedDiff(SAMPLE)
    const ranges = changed.get('src/app.css')!
    expect(ranges.some((r) => r.start === 33)).toBe(false)
  })

  it('isLineChanged checks membership', () => {
    const changed = parseUnifiedDiff(SAMPLE)
    const ranges = changed.get('src/app.css')
    expect(isLineChanged(ranges, 12)).toBe(true)
    expect(isLineChanged(ranges, 14)).toBe(false)
    expect(isLineChanged(undefined, 1)).toBe(false)
  })
})
