import { expect, test } from '@playwright/test'
import { makeFbx } from '../fixtures/fbx'

test('loads locally, selects takes, scrubs, steps and preserves time across FPS changes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Bring your motion into view.' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/empty-viewer.png' })
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'review.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx({ mesh: true })) })
  await expect(page.getByText('1 meshes · 3 bones · 2 takes')).toBeVisible()
  await expect(page.getByTestId('end-frame')).toHaveText('60')
  await page.screenshot({ path: 'test-results/skinned-viewer.png' })
  await page.getByRole('button', { name: 'Next frame', exact: true }).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('1')
  await page.getByRole('button', { name: 'Previous frame', exact: true }).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('0')
  await page.getByLabel('Timeline scrub').fill('30')
  await expect(page.getByLabel('Current frame')).toHaveValue('30')
  await page.getByLabel('Timeline FPS').selectOption('24')
  await expect(page.getByLabel('Current frame')).toHaveValue('24')
  await page.getByRole('button', { name: 'Go to end' }).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('48')
  await page.getByRole('button', { name: 'Previous frame', exact: true }).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('47')
  await page.getByRole('button', { name: 'Mesh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mesh', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByLabel('Animation take').selectOption('1')
  await expect(page.getByLabel('Current frame')).toHaveValue('0')
  await expect(page.getByTestId('end-frame')).toHaveText('24')
  await page.getByRole('button', { name: 'Loop', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 5000 })
  await expect(page.getByLabel('Current frame')).toHaveValue('24')
  await page.locator('canvas').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByLabel('Current frame')).toHaveValue('23')
  await page.keyboard.press('f')
  await page.screenshot({ path: 'test-results/loaded-viewer.png' })
  expect(errors).toEqual([])
})

test('renders embedded PNG and supports Maya mouse navigation', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({
    name: 'embedded.fbx', mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeFbx({ mesh: true, texture: 'embedded.png', embedded: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOo2LLvPwAGfALqic1i4wAAAABJRU5ErkJggg==' })),
  })
  await expect(page.getByText('1 meshes · 3 bones · 2 takes')).toBeVisible()
  await expect(page.locator('summary')).toHaveCount(0)
  const canvas = page.locator('canvas')
  await canvas.focus()
  const box = (await canvas.boundingBox())!
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const settled = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await settled()
  let previous = await canvas.screenshot()
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 100, start.y + 20, { steps: 6 })
  await page.mouse.up()
  await settled()
  expect((await canvas.screenshot()).equals(previous)).toBe(true)
  for (const button of ['left', 'middle', 'right'] as const) {
    await page.keyboard.down('Alt')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down({ button })
    await page.mouse.move(start.x + 100, start.y + 60, { steps: 6 })
    await page.mouse.up({ button })
    await page.keyboard.up('Alt')
    await settled()
    const next = await canvas.screenshot()
    expect(next.equals(previous)).toBe(false)
    previous = next
  }
  await page.mouse.wheel(0, 200)
  await settled()
  expect((await canvas.screenshot()).equals(previous)).toBe(false)
})

test('never requests an external texture and provides a fallback warning', async ({ page }) => {
  const unexpected: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/')) unexpected.push(request.url())
  })
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'missing.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx({ mesh: true, texture: 'https://example.com/private-texture.png' })) })
  await expect(page.getByText('1 meshes · 3 bones · 2 takes')).toBeVisible()
  await page.locator('summary').click()
  await expect(page.getByText(/External texture unavailable:/)).toBeVisible()
  expect(unexpected).toEqual([])
})

test('supports drop, static skeleton, invalid files and repeated replacement', async ({ page }) => {
  await page.goto('/')
  const drop = await page.evaluateHandle((source) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([source], 'static.fbx', { type: 'application/octet-stream' }))
    return transfer
  }, makeFbx({ animated: false }))
  await page.locator('main').dispatchEvent('drop', { dataTransfer: drop })
  await expect(page.getByText('0 meshes · 3 bones · 0 takes')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled()
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'bad.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from('not an fbx') })
  await expect(page.getByRole('alert')).toContainText('Could not read this FBX')
  await expect(page.getByText('0 meshes · 3 bones · 0 takes')).toBeVisible()
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Open FBX file').setInputFiles({ name: `replace-${i}.fbx`, mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx()) })
    await expect(page.getByText(`replace-${i}.fbx`, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
  }
  await expect(page.locator('canvas')).toHaveCount(1)
})
