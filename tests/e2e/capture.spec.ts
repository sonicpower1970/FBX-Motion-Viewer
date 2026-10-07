import { expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { makeFbx } from '../fixtures/fbx'

const meshOnly = `; FBX 7.4.0 project-owned static mesh test fixture
FBXHeaderExtension:  {
 FBXVersion: 7400
}
Objects:  {
 Model: 10, "Model::Prop", "Mesh" {
  Version: 232
  Properties70:  {
   P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
  }
 }
 Geometry: 11, "Geometry::Prop", "Mesh" {
  Vertices: *9 {
   a: -40,0,0,40,0,0,0,100,0
  }
  PolygonVertexIndex: *3 {
   a: 0,1,-3
  }
 }
}
Connections:  {
 C: "OO",10,0
 C: "OO",11,10
}
`.replace(/^ +/gm, spaces => '\t'.repeat(spaces.length))

for (const mode of ['dark', 'light'] as const) {
  for (const fixture of ['skeleton', 'skin', 'static-rig', 'mesh-only', 'legacy']) {
    test(`${mode} PNG: ${fixture}, full viewport / guide, Burn-in OFF / ON`, async ({ page }) => {
      const source = fixture === 'legacy' ? await readFile('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx', 'utf8')
        : fixture === 'mesh-only' ? meshOnly : makeFbx({ mesh: fixture !== 'skeleton', animated: fixture !== 'static-rig' })
      await page.goto('/')
      const result = await page.evaluate(async ({ source, mode, fixture }) => {
        const path = '/src/viewer/ViewerEngine.ts'
        const { ViewerEngine } = await import(/* @vite-ignore */ path)
        const host = document.createElement('div')
        host.style.cssText = 'position:fixed;inset:0;width:900px;height:800px'; document.body.append(host)
        const v = new ViewerEngine(host, () => {})
        const outputs: {name: string; width: number; height: number; difference: number; settings: object; png: string; reference: string}[] = []
        let output = new Blob(), name = ''
        Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async (options: {suggestedName: string}) => {
          name = options.suggestedName
          return { createWritable: async () => ({ write: async (blob: Blob) => { output = blob }, close: async () => {}, abort: async () => {} }) }
        } })
        try {
          await v.load(new File([source], 'capture_'.repeat(20) + fixture + '.fbx'))
          if (!v.asset) throw new Error(v.state.error || 'No asset')
          v.suspendRendering(true)
          v.setBackground(mode)
          v.setFrameGuide('16:9'); v.fit()
          v.setFollow(true)
          v.seekFrame(9)
          v.setXRay(true); v.setShadow(true)
          v.camera.zoom = 1.13; v.camera.position.x += 7
          v.camera.updateProjectionMatrix(); v.camera.updateMatrixWorld(true)
          const state = () => JSON.stringify({ p: v.camera.position.toArray(), q: v.camera.quaternion.toArray(),
            projection: v.camera.projectionMatrix.toArray(), inverse: v.camera.projectionMatrixInverse.toArray(),
            target: v.navigation.controls.target.toArray(), time: v.asset.playback.time, playing: v.asset.playback.playing,
            follow: v.follow.snapshot(), transform: v.asset.root.matrixWorld.toArray(),
            size: v.renderer.getSize({ set: (x: number, y: number) => [x,y] }), ratio: v.renderer.getPixelRatio() })
          // Capture must not re-fit even with FIT enabled, nor reset/update Follow or seek.
          v.navigation.fit = () => { throw new Error('Capture called Fit') }
          v.follow.update = () => { throw new Error('Capture updated Follow') }
          v.follow.resetFollowReferenceWithoutMovingCamera = () => { throw new Error('Capture reset Follow') }
          v.asset.playback.seek = () => { throw new Error('Capture changed animation frame') }
          for (const guide of ['off', '16:9']) for (const burn of [false, true]) {
            v.setFrameGuide(guide); v.setBurnIn(burn)
            // Reference is the exact visible gate, with only burn-in composited.
            v.renderer.render(v.scene, v.camera); v.drawBurnIn()
            const scene = v.renderer.domElement
            const ref = document.createElement('canvas')
            ref.width = guide === 'off' ? 900 : 1920; ref.height = guide === 'off' ? 800 : 1080
            const ctx = ref.getContext('2d')!
            const height = guide === 'off' ? scene.height : scene.width * 9/16
            const top = (scene.height - height)/2
            ctx.drawImage(scene, 0, top, scene.width, height, 0, 0, ref.width, ref.height)
            if (burn) ctx.drawImage(v.burnIn.canvas, 0, top, scene.width, height, 0, 0, ref.width, ref.height)
            const before = state()
            await v.captureImage()
            if (v.state.exportStatus !== 'Capture complete') throw new Error(v.state.error || v.state.exportStatus)
            if (state() !== before) throw new Error('Capture changed Viewer state')
            if (output.type !== 'image/png') throw new Error('PNG MIME mismatch')
            const bitmap = await createImageBitmap(output)
            const decoded = document.createElement('canvas'); decoded.width = bitmap.width; decoded.height = bitmap.height
            const dc = decoded.getContext('2d')!; dc.drawImage(bitmap,0,0); bitmap.close()
            const a = ctx.getImageData(0,0,ref.width,ref.height).data, b = dc.getImageData(0,0,ref.width,ref.height).data
            let difference=0
            for (let i=0;i<a.length;i+=4) difference+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])
            outputs.push({name, width: decoded.width, height: decoded.height, difference: difference/(ref.width*ref.height*3),
              settings: v.burnInSettings(), png: decoded.toDataURL(), reference: ref.toDataURL()})
          }
          return {outputs, animated: v.state.clipIndex>=0, meshes: v.asset.info.meshes, bones: v.asset.info.bones}
        } finally { v.dispose(); host.remove() }
      }, {source,mode,fixture})
      expect(result.outputs.map(r=>[r.width,r.height])).toEqual([[900,800],[900,800],[1920,1080],[1920,1080]])
      for (const [index,r] of result.outputs.entries()) {
        await writeFile(`test-results/capture-${mode}-${fixture}-${index}.png`, Buffer.from(r.png.split(',')[1],'base64'))
        await writeFile(`test-results/reference-${mode}-${fixture}-${index}.png`, Buffer.from(r.reference.split(',')[1],'base64'))
        // Native Full HD grid lines are sharper than the upscaled viewport reference.
        // Projection invariance is also checked independently in composition unit tests.
        expect(r.difference).toBeLessThan(8)
        expect(r.name).toMatch(result.animated ? /_f0009\.png$/ : /\.png$/)
        if (!result.animated) expect(r.name).not.toContain('_f0000')
      }
      await writeFile(`test-results/capture-${mode}-${fixture}-metrics.json`, JSON.stringify(result.outputs.map(({name,width,height,difference,settings})=>({name,width,height,difference,settings})),null,2))
      expect(result.outputs[3].settings).toEqual({filename:true,frame:result.animated})
      if (fixture==='mesh-only') { expect(result.meshes).toBe(1); expect(result.bones).toBe(0) }
      await writeFile(`test-results/capture-${mode}-${fixture}.png`, Buffer.from(result.outputs[3].png.split(',')[1],'base64'))
    })
  }
}

for (const mode of ['dark','light'] as const) test(`${mode}: PNG and encoded MP4 match the same FOLLOW frame`, async ({page})=>{
  test.setTimeout(90000)
  await page.goto('/')
  const result=await page.evaluate(async ({source,mode})=>{
    const path='/src/viewer/ViewerEngine.ts'
    const {ViewerEngine}=await import(/* @vite-ignore */ path)
    const host=document.createElement('div');host.style.cssText='position:fixed;width:1500px;height:600px';document.body.append(host)
    const v=new ViewerEngine(host,()=>{})
    let saved=new Blob()
    Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async()=>({createWritable:async()=>({write:async(b:Blob)=>{saved=b},close:async()=>{},abort:async()=>{}})})})
    try {
      await v.load(new File([source],'walk.fbx'));v.suspendRendering(true)
      v.setBackground(mode);v.setFrameGuide('16:9');v.setBurnIn(true);v.fit();v.setFitEnabled(false)
      v.setFollow(true);v.seekFrame(30);v.setShadow(true);v.setXRay(true)
      await v.captureImage();const png=saved
      await v.exportMovie('1080p')
      const library=performance.getEntriesByType('resource').map(e=>e.name).find(n=>/\/mediabunny\.js(?:\?|$)/.test(n))!
      const {Input,BlobSource,MP4,VideoSampleSink}=await import(/* @vite-ignore */ library)
      const input=new Input({formats:[MP4],source:new BlobSource(saved)})
      try {
        const track=await input.getPrimaryVideoTrack(),sample=await new VideoSampleSink(track).getSample(1)
        const a=document.createElement('canvas'),b=document.createElement('canvas')
        a.width=b.width=1920;a.height=b.height=1080
        const ac=a.getContext('2d')!,bc=b.getContext('2d')!,bitmap=await createImageBitmap(png)
        ac.drawImage(bitmap,0,0);bitmap.close();try{sample.draw(bc,0,0)}finally{sample.close()}
        const x=ac.getImageData(0,0,1920,1080).data,y=bc.getImageData(0,0,1920,1080).data
        let diff=0;for(let i=0;i<x.length;i+=4)diff+=Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2])
        return {diff:diff/(1920*1080*3),status:v.state.exportStatus,time:v.asset.playback.time,pixel:Array.from(ac.getImageData(5,5,1,1).data),png:a.toDataURL(),mp4:b.toDataURL()}
      }finally{input.dispose()}
    }finally{v.dispose();host.remove()}
  },{source:makeFbx({mesh:true}),mode})
  await writeFile(`test-results/capture-${mode}-mp4-metrics.json`, JSON.stringify({difference:result.diff,pixel:result.pixel},null,2))
  expect(result.status).toBe('Export complete');expect(result.time).toBe(1);expect(result.diff).toBeLessThan(3)
  expect(result.pixel).toEqual(mode==='dark'?[28,35,43,255]:[184,184,184,255])
  for(const type of ['png','mp4'] as const)await writeFile(`test-results/capture-${mode}-match-${type}.png`,Buffer.from(result[type].split(',')[1],'base64'))
})

test('PNG download fallback, static UI, themes and real browser file writes',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined}))
  await page.goto('/')
  await expect(page.getByRole('button',{name:'CAPTURE',exact:true})).toBeDisabled()
  await page.getByLabel('Open FBX file').setInputFiles({name:'prop.fbx',mimeType:'application/octet-stream',buffer:Buffer.from(meshOnly)})
  await expect(page.getByRole('button',{name:'CAPTURE',exact:true})).toBeEnabled()
  await expect(page.getByRole('button',{name:'EXPORT MP4',exact:true})).toBeDisabled()
  const theme=page.getByRole('button',{name:'Light viewport background',exact:true})
  await expect(theme).toHaveText('◐ DARK');await theme.click();await expect(theme).toHaveText('☀ LIGHT')
  await page.getByRole('button',{name:'16:9 Frame Guide',exact:true}).click()
  await page.getByRole('button',{name:'BURN-IN',exact:true}).click()
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'CAPTURE',exact:true}).click()
  const download=await event;expect(download.suggestedFilename()).toBe('prop.png')
  await expect(page.getByText('Capture complete',{exact:true})).toBeVisible()
  await page.screenshot({path:'test-results/capture-light-ui.png'})
  await page.evaluate(()=>Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async(o:{suggestedName:string})=>(await navigator.storage.getDirectory()).getFileHandle(o.suggestedName,{create:true})}))
  await page.getByRole('button',{name:'CAPTURE',exact:true}).click()
  await expect(page.getByText('Capture complete',{exact:true})).toBeVisible()
  const saved=await page.evaluate(async()=>{
    const file=await(await(await navigator.storage.getDirectory()).getFileHandle('prop.png')).getFile()
    const bitmap=await createImageBitmap(file);const result={size:file.size,width:bitmap.width,height:bitmap.height};bitmap.close();return result
  })
  expect(saved.size).toBeGreaterThan(1000);expect(saved.width).toBe(1920);expect(saved.height).toBe(1080)
  await theme.click();await page.screenshot({path:'test-results/capture-dark-ui.png'})
})

test('picker cancellation, save failure and capture cancellation restore playback without seeking',async({page})=>{
  await page.goto('/')
  const result=await page.evaluate(async source=>{
    const path='/src/viewer/ViewerEngine.ts';const {ViewerEngine}=await import(/* @vite-ignore */ path)
    const host=document.createElement('div');host.style.cssText='width:721px;height:401px';document.body.append(host)
    const v=new ViewerEngine(host,()=>{}),states=[]
    try{
      await v.load(new File([source],'walk.fbx'));v.suspendRendering(true);v.seekFrame(25);v.asset.playback.playing=true
      const before=JSON.stringify({camera:v.camera.toJSON(),follow:v.follow.snapshot(),time:v.asset.playback.time})
      let aborted=0,closed=0,bytes=0
      for(const kind of ['picker','write','cancel','encode']){
        Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async()=>{
          if(kind==='picker')throw new DOMException('Cancel','AbortError')
          if(kind==='cancel')v.cancelExport()
          return {createWritable:async()=>({write:async(b:Blob)=>{bytes+=b.size;if(kind==='write')throw new Error('Disk full')},close:async()=>{closed++},abort:async()=>{aborted++}})}
        }})
        const original=HTMLCanvasElement.prototype.toBlob
        if(kind==='encode')HTMLCanvasElement.prototype.toBlob=function(cb:BlobCallback){cb(null)}
        try{await v.captureImage()}finally{HTMLCanvasElement.prototype.toBlob=original}
        if(JSON.stringify({camera:v.camera.toJSON(),follow:v.follow.snapshot(),time:v.asset.playback.time})!==before)throw new Error('State changed')
        states.push({status:v.state.exportStatus,error:v.state.error,playing:v.asset.playback.playing,capturing:v.state.capturing,controls:v.navigation.controls.enabled})
      }
      return {states,aborted,closed,bytes}
    }finally{v.dispose();host.remove()}
  },makeFbx())
  expect(result.states.map(s=>s.status)).toEqual(['Capture cancelled','Capture failed','Capture cancelled','Capture failed'])
  expect(result.states[0].error).toBeNull();expect(result.states[2].error).toBeNull()
  result.states.forEach(s=>{expect(s.playing).toBe(true);expect(s.capturing).toBe(false);expect(s.controls).toBe(true)})
  expect(result.aborted).toBe(1);expect(result.closed).toBe(0)
})

test('Retina full-viewport PNG uses CSS pixels and picker receives click activation',async({browser})=>{
  const context=await browser.newContext({deviceScaleFactor:2,viewport:{width:1440,height:960}})
  const page=await context.newPage()
  try {
    await page.goto('http://127.0.0.1:5173/')
    await page.getByLabel('Open FBX file').setInputFiles({name:'static.fbx',mimeType:'application/octet-stream',buffer:Buffer.from(meshOnly)})
    await expect(page.getByRole('button',{name:'CAPTURE',exact:true})).toBeEnabled()
    await page.evaluate(()=>Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async()=>{
      if(!navigator.userActivation.isActive)throw new Error('Missing click activation')
      return {createWritable:async()=>({write:async(b:Blob)=>{
        const bitmap=await createImageBitmap(b)
        const w=window as unknown as {captureDimensions:number[]};w.captureDimensions=[bitmap.width,bitmap.height];bitmap.close()
      },close:async()=>{},abort:async()=>{}})}
    }}))
    const viewport=await page.locator('.viewport').boundingBox()
    await page.getByRole('button',{name:'CAPTURE',exact:true}).click()
    await expect(page.getByText('Capture complete',{exact:true})).toBeVisible()
    expect(await page.evaluate(()=>(window as unknown as {captureDimensions:number[]}).captureDimensions)).toEqual([Math.round(viewport!.width),Math.round(viewport!.height)])
  }finally{await context.close()}
})

test('LIGHT is inherited by UI Batch; encoded output and live viewer retain selected background',async({page})=>{
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({name:'live.fbx',mimeType:'application/octet-stream',buffer:Buffer.from(makeFbx({mesh:true}))})
  await expect(page.getByLabel('Timeline scrub')).toBeEnabled()
  await page.getByLabel('Timeline scrub').fill('25')
  await page.getByRole('button',{name:'Light viewport background',exact:true}).click()
  await page.evaluate(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:async()=>(await navigator.storage.getDirectory()).getDirectoryHandle('light-batch',{create:true})}))
  await page.getByRole('button',{name:'BATCH EXPORT',exact:true}).click()
  await page.getByLabel('Batch input files').setInputFiles({name:'batch-light.fbx',mimeType:'application/octet-stream',buffer:Buffer.from(makeFbx({mesh:true}))})
  await page.getByRole('button',{name:'SELECT FOLDER',exact:true}).click()
  await page.getByLabel('Batch resolution').selectOption('720p')
  await page.getByRole('button',{name:'START BATCH',exact:true}).click()
  await page.getByRole('cell',{name:'Done',exact:true}).waitFor()
  const pixel=await page.evaluate(async()=>{
    const directory=await(await navigator.storage.getDirectory()).getDirectoryHandle('light-batch')
    const blob=await(await directory.getFileHandle('batch-light.mp4')).getFile()
    const library=performance.getEntriesByType('resource').map(e=>e.name).find(n=>/\/mediabunny\.js(?:\?|$)/.test(n))!
    const {Input,BlobSource,MP4,VideoSampleSink}=await import(/* @vite-ignore */ library)
    const input=new Input({formats:[MP4],source:new BlobSource(blob)})
    try{
      const track=await input.getPrimaryVideoTrack(),sample=await new VideoSampleSink(track).getSample(0)
      const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d')!
      try{sample.draw(ctx,0,0)}finally{sample.close()}
      return Array.from(ctx.getImageData(5,5,1,1).data)
    }finally{input.dispose()}
  })
  pixel.slice(0,3).forEach(n=>expect(Math.abs(n-184)).toBeLessThan(4))
  await page.getByRole('button',{name:'Close',exact:true}).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('25')
  await expect(page.getByRole('button',{name:'Light viewport background',exact:true})).toHaveAttribute('aria-pressed','true')
})

test('capture reflects visibility, excludes guide UI and locks the exact frame while the picker is pending',async({page})=>{
  await page.goto('/')
  const result=await page.evaluate(async source=>{
    const path='/src/viewer/ViewerEngine.ts';const {ViewerEngine}=await import(/* @vite-ignore */ path)
    const host=document.createElement('div');host.style.cssText='width:1200px;height:500px';document.body.append(host)
    const v=new ViewerEngine(host,()=>{}),records=[]
    let output=new Blob(),release:(value:unknown)=>void=()=>{}
    const handle={createWritable:async()=>({write:async(b:Blob)=>{output=b},close:async()=>{},abort:async()=>{}})}
    try{
      await v.load(new File([source],'visible.fbx'));v.suspendRendering(true);v.seekFrame(25);v.setFrameGuide('16:9')
      for(const mode of ['dark','light'])for(const visible of [false,true]){
        v.setBackground(mode);v.setVisibility('meshVisible',visible);v.setVisibility('boneVisible',visible)
        v.setVisibility('gridVisible',visible);v.setXRay(visible);v.setShadow(visible)
        Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:()=>new Promise(resolve=>{release=resolve})})
        v.asset.playback.playing=true
        const before={time:v.asset.playback.time,p:v.camera.position.toArray(),q:v.camera.quaternion.toArray(),target:v.navigation.controls.target.toArray()}
        const pending=v.captureImage()
        v.setBackground(mode==='dark'?'light':'dark');v.setVisibility('meshVisible',!visible);v.setBurnIn(true)
        v.setFollow(true);v.setFitEnabled(false);v.seekFrame(0);v.step(1);v.togglePlay();v.render(performance.now()+1000)
        if(v.state.background!==mode||v.state.meshVisible!==visible||v.state.burnIn||v.asset.playback.time!==before.time||v.navigation.controls.enabled)throw new Error('Capture lock failed')
        release(handle);await pending
        if(!v.asset.playback.playing||JSON.stringify(before)!==JSON.stringify({time:v.asset.playback.time,p:v.camera.position.toArray(),q:v.camera.quaternion.toArray(),target:v.navigation.controls.target.toArray()}))throw new Error('State not preserved')
        const bitmap=await createImageBitmap(output),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height
        const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close()
        const pixels=ctx.getImageData(0,0,1920,1080).data,expected=mode==='dark'?[28,35,43]:[184,184,184]
        let different=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==expected[0]||pixels[i+1]!==expected[1]||pixels[i+2]!==expected[2])different++
        records.push({mode,visible,different,status:v.state.exportStatus})
      }
      return records
    }finally{v.dispose();host.remove()}
  },makeFbx({mesh:true}))
  for(const record of result){expect(record.status).toBe('Capture complete');if(record.visible)expect(record.different).toBeGreaterThan(1000);else expect(record.different).toBe(0)}
})
