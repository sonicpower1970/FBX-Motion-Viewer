import { makeFbx } from '../fixtures/fbx'
import { test, expect } from '@playwright/test'

// Opt-in: production FBX stays at its original local path, never copied into the repository.
test('local production FBX 6000 loads, animates and survives replacement', async ({ page }) => {
  const path = process.env.FBX_LEGACY_SAMPLE
  test.skip(!path, 'Set FBX_LEGACY_SAMPLE to a local FBX 6000 skeleton for manual regression.')
  const external: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/')) external.push(request.url())
  })
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles(path!)
  await expect(page.getByText('0 meshes · 25 bones · 1 takes')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('end-frame')).toHaveText('932')
  await page.getByLabel('Timeline scrub').fill('300')
  await expect(page.getByLabel('Current frame')).toHaveValue('300')
  await page.getByRole('button', { name: 'Next frame', exact: true }).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('301')
  await page.getByRole('button', { name: 'Go to end' }).click()
  await page.getByRole('button', { name: 'Previous frame', exact: true }).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('931')
  await page.getByLabel('Timeline scrub').fill('0')
  const first = await page.locator('canvas').screenshot()
  await page.getByLabel('Timeline scrub').fill('932')
  expect((await page.locator('canvas').screenshot()).equals(first)).toBe(false)
  await page.screenshot({ path: 'test-results/legacy-production.png' })
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('Open FBX file').setInputFiles(path!)
    await expect(page.getByText('0 meshes · 25 bones · 1 takes')).toBeVisible()
    await expect(page.getByLabel('Current frame')).toHaveValue('0')
  }
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('legacy skinned mesh loads multiple takes and switches poses', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (/GL_INVALID|THREE.WebGLProgram/.test(e.text())) errors.push(e.text()) })
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx')
  await expect(page.getByText('1 meshes · 4 bones · 3 takes')).toBeVisible()
  await page.getByLabel('Timeline FPS').selectOption('24')
  await expect(page.getByTestId('end-frame')).toHaveText('19')
  await page.getByLabel('Timeline scrub').fill('9')
  await page.screenshot({ path: 'test-results/legacy-skinned.png' })
  const first = await page.locator('canvas').screenshot()
  await page.getByLabel('Animation take').selectOption('2')
  await expect(page.getByLabel('Current frame')).toHaveValue('0')
  await expect(page.getByTestId('end-frame')).toHaveText('20')
  await page.getByLabel('Timeline scrub').fill('10')
  expect((await page.locator('canvas').screenshot()).equals(first)).toBe(false)
  expect(errors).toEqual([])
})

test('cancel terminates a pending legacy load, retains old asset and permits retry', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles('tests/fixtures/legacy/maya_game_sausage_6100_ascii.fbx')
  await expect(page.getByText('1 meshes · 4 bones · 0 takes')).toBeVisible()
  // Hold module loading deterministically instead of depending on CPU speed.
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/legacy.worker.ts*', async route => { await pending; await route.continue().catch(() => {}) })
  await page.getByLabel('Open FBX file').setInputFiles('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx')
  await page.getByRole('button', { name: 'Cancel loading' }).click()
  await expect(page.getByText('1 meshes · 4 bones · 0 takes')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  release()
  await page.unroute('**/legacy.worker.ts*')
  await page.getByLabel('Open FBX file').setInputFiles('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx')
  await expect(page.getByText('1 meshes · 4 bones · 3 takes')).toBeVisible()
})

test('WASM material bridge decodes embedded PNG and never fetches texture paths', async ({ page }) => {
  const external: string[] = []
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/')) external.push(request.url()) })
  await page.goto('/')
  for (const embedded of ['', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOo2LLvPwAGfALqic1i4wAAAABJRU5ErkJggg==']) {
    const source = makeFbx({ mesh: true, texture: 'https://example.com/private.png', embedded })
    const result = await page.evaluate(async (text) => {
      // Exercise the compatibility material path directly with a synthetic fixture.
      const loaderPath = '/src/viewer/legacy/loadLegacyFbx.ts'
      const { loadLegacyFbx } = await import(/* @vite-ignore */ loaderPath)
      const { root, warnings } = await loadLegacyFbx(new TextEncoder().encode(text).buffer)
      let images = 0
      root.traverse((object: { material?: { map?: { image?: HTMLImageElement } } | { map?: { image?: HTMLImageElement } }[] }) => {
        if (object.material) for (const m of Array.isArray(object.material) ? object.material : [object.material]) if (m.map?.image?.naturalWidth) images++
      })
      const disposePath = '/src/viewer/disposeAsset.ts'
      const { disposeAsset } = await import(/* @vite-ignore */ disposePath)
      disposeAsset(root)
      return { images, warnings }
    }, source)
    if (embedded) expect(result.images).toBeGreaterThan(0)
    else { expect(result.images).toBe(0); expect(result.warnings.join()).toContain('unavailable') }
  }
  expect(external).toEqual([])
})
