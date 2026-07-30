import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../..')

function packageVersion(): string {
  const raw = readFileSync(resolve(ROOT, 'package.json'), 'utf-8')
  return (JSON.parse(raw) as { version: string }).version
}

describe('firetool --version', () => {
  it('reports the version declared in package.json', async () => {
    const proc = Bun.spawn(['bun', resolve(ROOT, 'src/cli/index.ts'), '--version'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout.trim()).toBe(packageVersion())
  })

  it('does not hardcode a version string in the entrypoint', () => {
    const source = readFileSync(resolve(ROOT, 'src/cli/index.ts'), 'utf-8')
    expect(source).not.toMatch(/\.version\(\s*['"]\d+\.\d+\.\d+['"]\s*\)/)
  })
})
