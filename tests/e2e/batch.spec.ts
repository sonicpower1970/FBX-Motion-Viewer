import { test, expect } from '@playwright/test'
import { makeFbx } from '../fixtures/fbx'

// Real load/render/WebCodecs path with in-memory directory handles; no save prompts.
test('10 sequential jobs: FPS, scale, failure/retry, cancellation, disposal and Viewer preservation', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/')
  const result = await page.evaluate(async source => {
    const controllerPath = '/src/batch/BatchController.ts', enginePath = '/src/viewer/ViewerEngine.ts'
    const { BatchController } = await import(/* @vite-ignore */ controllerPath) as typeof import('../../src/batch/BatchController')
    const { ViewerEngine } = await import(/* @vite-ignore */ enginePath)
    const liveHost = document.createElement('div'); liveHost.style.cssText='width:900px;height:700px'; document.body.append(liveHost)
    const live = new ViewerEngine(liveHost, () => {})
    await live.load(new File([source], 'viewer.fbx')); live.suspendRendering(true)
    live.seekFrame(25); live.camera.zoom=1.3; live.camera.updateProjectionMatrix()
    const liveState = () => JSON.stringify({ state:live.state, camera:live.camera.toJSON(), follow:live.follow.snapshot().previous.toArray(), target:live.navigation.controls.target.toArray() })
    const original = liveState()
    const blobs = new Map<string,Blob>(), records: {name:string; frames:number; fps:number; duration:number; bytes:number}[] = []
    const resources: {geometries:number; textures:number}[] = []
    let active=0, maxActive=0, disposed=0, failedSave=true, cancelOnFrame=false
    const create = ViewerEngine.prototype.prepareBatch, dispose=ViewerEngine.prototype.dispose
    ViewerEngine.prototype.prepareBatch = function (burn: boolean) { active++; maxActive=Math.max(maxActive,active); return create.call(this,burn) }
    ViewerEngine.prototype.dispose = function () { disposed++; active=0; dispose.call(this); resources.push({...this.renderer.info.memory}) }
    const directory = { name:'Memory folder', getFileHandle:async (name:string, options?:{create?:boolean}) => {
      if (!options?.create && !blobs.has(name)) throw new DOMException('Not found','NotFoundError')
      return { createWritable: async () => {
        if (name.startsWith('retry') && failedSave) { failedSave=false; throw new Error('Simulated save failure') }
        let pending = new Blob()
        return { write:async (b:Blob)=>{pending=b}, close:async ()=>{blobs.set(name,pending)}, abort:async()=>{} }
      } }
    } }
    const batch = new BatchController(() => { if(cancelOnFrame && batch.jobs.some(j=>j.status==='Exporting' && j.progress>0)) batch.cancel() })
    const modes=[11,9,6,17,3,undefined,11,6,17,3]
    const files=modes.map((mode,index)=>new File([source.replace('Properties70:  {', `Properties70:  {\n\t\tP: "TimeMode", "enum", "", "",${mode ?? 0}`).replace('"Lcl Scaling", "Lcl Scaling", "", "A",1,1,1', `"Lcl Scaling", "Lcl Scaling", "", "A",${index+1},${index+1},${index+1}`)], `${index===7?'retry':'walk'}_${index}.fbx`))
    files.splice(3,0,new File(['broken'], 'broken.fbx'))
    batch.add(files)
    try {
      await batch.run({directory,resolution:'720p',burnIn:true})
      const first=batch.jobs.map(j=>({status:j.status,fps:j.frameRate,frames:j.frames,error:j.error}))
      const countBeforeRetry=blobs.size
      await batch.run({directory,resolution:'1080p',burnIn:false},true)
      const countAfterRetry=blobs.size
      const library=performance.getEntriesByType('resource').map(e=>e.name).find(n=>/\/mediabunny\.js(?:\?|$)/.test(n))!
      const {Input,BlobSource,MP4}=await import(/* @vite-ignore */ library)
      for(const job of batch.jobs.filter(j=>j.status==='Done')) {
        const blob=blobs.get(job.outputName!)!, input=new Input({formats:[MP4],source:new BlobSource(blob)})
        try { const track=await input.getPrimaryVideoTrack(); const stats=await track.computePacketStats(); records.push({name:job.file.name,frames:stats.packetCount,fps:job.frameRate!.fps,duration:await input.computeDuration(),bytes:blob.size}) } finally {input.dispose()}
      }
      const beforeCancel=blobs.size
      cancelOnFrame=true
      batch.add([new File([source],'cancel.fbx'),new File([source],'remaining.fbx')])
      await batch.run({directory,resolution:'720p',burnIn:false})
      return {first,records,countBeforeRetry,countAfterRetry,beforeCancel,afterCancel:blobs.size,cancelled:batch.jobs.slice(-2).map(j=>j.status),maxActive,disposed,active,resources,preserved:original===liveState(), hosts:document.querySelectorAll('[aria-hidden="true"][style*="-10000"]').length}
    } finally { batch.dispose(); ViewerEngine.prototype.prepareBatch=create; ViewerEngine.prototype.dispose=dispose; live.dispose(); liveHost.remove() }
  }, makeFbx({mesh:true}))
  expect(result.first.filter(j=>j.status==='Done')).toHaveLength(9)
  expect(result.first.filter(j=>j.status==='Failed')).toHaveLength(2)
  expect(result.countAfterRetry).toBe(result.countBeforeRetry+1)
  expect(result.records).toHaveLength(10)
  for(const row of result.records) { expect(row.frames).toBe(Math.ceil(2*row.fps-1e-7)+1); expect(row.duration).toBeCloseTo(row.frames/row.fps,3); expect(row.bytes).toBeGreaterThan(1000) }
  expect(result.first[0].fps).toMatchObject({fps:24,fallback:false})
  expect(result.first[1].fps?.fps).toBeCloseTo(30000/1001,8)
  expect(result.first[4].fps?.fps).toBeCloseTo(60000/1001,8)
  expect(result.first[6].fps).toMatchObject({fps:30,fallback:true})
  expect(result.cancelled).toEqual(['Cancelled','Cancelled'])
  expect(result.afterCancel).toBe(result.beforeCancel)
  expect(result.maxActive).toBe(1); expect(result.active).toBe(0); expect(result.disposed).toBe(14)
  result.resources.forEach(count => { expect(count.geometries).toBe(0); expect(count.textures).toBe(0) })
  expect(result.preserved).toBe(true); expect(result.hosts).toBe(0)
})

test('Batch dialog accepts files, detects unsupported folder API and restores regular Viewer controls', async ({page}) => {
  await page.goto('/')
  await page.evaluate(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:undefined}))
  await page.getByRole('button',{name:'BATCH EXPORT',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Batch saving requires folder access', {exact:false})).toBeVisible()
  await page.getByLabel('Batch input files').setInputFiles([0,1,2].map(i=>({name:`motion_${i}.fbx`,mimeType:'application/octet-stream',buffer:Buffer.from(makeFbx())})))
  await expect(page.getByRole('cell',{name:'Waiting',exact:true})).toHaveCount(3)
  await expect(page.getByRole('button',{name:'START BATCH',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'Close',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Open FBX file').setInputFiles({name:'single.fbx',mimeType:'application/octet-stream',buffer:Buffer.from(makeFbx())})
  await expect(page.getByText('0 meshes · 3 bones · 2 takes')).toBeVisible()
})

test('three-file UI batch: folder chosen once, drag/drop, legacy take, different durations and collision-safe names', async ({page}) => {
  test.setTimeout(90000)
  await page.goto('/')
  await page.evaluate(() => {
    const output: Record<string,number> = { 'short.mp4': 123 }
    Object.assign(window, {batchTestOutput:output,batchPickerCount:0})
    Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:async()=>{
      if(!navigator.userActivation.isActive) throw new Error('Missing user activation')
      const w=window as unknown as {batchPickerCount:number}; w.batchPickerCount++
      return {name:'Test previews',getFileHandle:async(name:string, options?:{create?:boolean})=>{
        if(!options?.create && !(name in output)) throw new DOMException('Missing','NotFoundError')
        let data=new Blob()
        return {createWritable:async()=>({write:async(blob:Blob)=>{data=blob},close:async()=>{output[name]=data.size},abort:async()=>{}})}
      }}
    }})
    Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async()=>{throw new Error('Batch must not open a per-file save picker')}})
  })
  const drop = await page.evaluateHandle(source=>{
    const data=new DataTransfer()
    // Distinct first-take lengths, in seconds; no speed scaling from FPS.
    data.items.add(new File([source.replaceAll('92372316000','23093079000').replaceAll('46186158000','11546539500')],'short.fbx'))
    data.items.add(new File([source],'long.fbx'))
    return data
  },makeFbx({mesh:true}))
  await page.locator('.app-shell').dispatchEvent('drop',{dataTransfer:drop})
  await drop.dispose()
  await expect(page.getByRole('dialog')).toBeVisible()
  const legacy=process.env.FBX_LEGACY_SAMPLE || 'tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx'
  await page.getByLabel('Batch input files').setInputFiles(legacy)
  await page.getByRole('button',{name:'SELECT FOLDER',exact:true}).click()
  await page.getByRole('button',{name:'START BATCH',exact:true}).click()
  await expect(page.getByText('Completed: 3', {exact:false})).toBeVisible({timeout:60000})
  await expect(page.getByRole('cell',{name:'Done',exact:true})).toHaveCount(3)
  const result=await page.evaluate(()=>({output:(window as unknown as {batchTestOutput:Record<string,number>}).batchTestOutput,pickers:(window as unknown as {batchPickerCount:number}).batchPickerCount}))
  expect(result.pickers).toBe(1); expect(result.output['short.mp4']).toBe(123)
  expect(result.output['short (1).mp4']).toBeGreaterThan(1000)
  expect(result.output['long.mp4']).toBeGreaterThan(1000)
  await page.screenshot({path:'test-results/batch-complete.png'})
  await page.getByRole('button',{name:'Close',exact:true}).click()
  await expect(page.getByRole('button',{name:'BATCH EXPORT',exact:true})).toBeEnabled()
})
