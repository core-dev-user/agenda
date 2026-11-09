const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { createSession } = require('../electron/native-client.cjs')
const { coalescedRunner } = require('../electron/coalesced-runner.cjs')

function child() { const c = new EventEmitter(); c.stdout = new PassThrough(); c.stdin = new PassThrough(); return c }
const drain = async () => { for (let i=0; i<8; i++) await Promise.resolve() }

test('native protocol correlates out-of-order replies and does not consume WinEvents', async () => {
  const c = child(), s = createSession(c)
  const events = []; s.events.on('event', (e) => events.push(e))
  c.stdout.write('{"ready":true}\n')
  const a = s.call('list'), b = s.call('heartbeat'); await drain()
  c.stdout.write('{"event":"windows"}\n{"id":2,"result":"ok"}\n{"id":1,')
  c.stdout.write('"result":"snapshot"}\n')
  assert.equal(await a, 'snapshot'); assert.equal(await b, 'ok')
  assert.deepEqual(events, ['windows']); s.close()
})

test('failed launch and lost process settle readiness and all pending requests', async () => {
  for (const beforeReady of [true,false]) {
    const c = child(), s = createSession(c)
    if (!beforeReady) c.stdout.write('{"ready":true}\n')
    const request = s.call('appbar'); await drain()
    c.emit('error', new Error('spawn failed'))
    assert.equal(await request, ''); assert.equal(s.closed,true)
    assert.equal(await s.call('list'),'')
  }
})

test('command timeout closes the session so late replies cannot corrupt the next command', async (t) => {
  t.mock.timers.enable({ apis:['setTimeout'] })
  const c = child(), s = createSession(c,{commandMs:50})
  c.stdout.write('{"ready":true}\n')
  const request=s.call('appbar'); await drain(); t.mock.timers.tick(50)
  assert.equal(await request,''); assert.equal(s.closed,true)
  c.stdout.write('{"id":1,"result":"late"}\n')
  assert.equal(await s.call('restore'),'')
})

test('native startup timeout is bounded and command errors do not desynchronize replies', async (t) => {
  t.mock.timers.enable({ apis:['setTimeout'] })
  const c=child(), s=createSession(c,{startupMs:50}); t.mock.timers.tick(50)
  assert.equal(await s.ready,false)
  const other=child(), next=createSession(other);other.stdout.write('{"ready":true}\n')
  const a=next.call('appbar'), b=next.call('restore');await drain()
  other.stdout.write('{"id":1,"error":"access denied"}\n{"id":2,"result":"ok"}\n')
  assert.equal(await a,'');assert.equal(await b,'ok');next.close()
})

test('window-event bursts have one in-flight snapshot and one follow-up', async (t) => {
  t.mock.timers.enable({ apis:['setTimeout'] })
  let calls=0, finish; const runner=coalescedRunner(()=>{calls++;return new Promise(r=>{finish=r})}, assert.fail, 75)
  for(let i=0;i<500;i++)runner.request()
  t.mock.timers.tick(75);assert.equal(calls,1)
  for(let i=0;i<500;i++)runner.request()
  t.mock.timers.tick(1000);assert.equal(calls,1)
  finish();await drain();t.mock.timers.tick(75);assert.equal(calls,2)
  runner.request();runner.stop();finish();await drain();t.mock.timers.tick(1000)
  assert.equal(calls,2)
})

function barHarness({ holdReady = false } = {}) {
  const fs = require('node:fs'), path = require('node:path')
  const handlers=new Map(), native=new EventEmitter(), app=new EventEmitter(), windows=[], commands=[]
  let rejectReservation=false, primary=true
  class Win extends EventEmitter {
    constructor(opts) { super();this.bounds=opts;this.dead=false;this.webContents=new EventEmitter();this.webContents.send=()=>{};windows.push(this) }
    isDestroyed(){return this.dead} setBounds(b){this.bounds=b} getBounds(){return this.bounds}
    setAlwaysOnTop(){} hookWindowMessage(){} showInactive(){} hide(){}
    loadFile(){if(!holdReady)queueMicrotask(()=>this.emit('ready-to-show'));return Promise.resolve()}
    destroy(){this.dead=true;this.emit('closed')}
  }
  app.getPath=()=>'/fake';app.whenReady=()=>new Promise(()=>{});app.getFileIcon=async()=>({toDataURL:()=>''})
  const display={bounds:{x:0,y:0,width:1920,height:1080},workArea:{x:0,y:0,width:1920,height:1016}}
  const screen=Object.assign(new EventEmitter(),{getPrimaryDisplay:()=>display,dipToScreenRect:(_,r)=>r,screenToDipRect:(_,r)=>r})
  const winh={retry(){},hwndOf:()=> '123',on:(ev,fn)=>native.on(ev,fn),async call(cmd){commands.push(cmd);if(cmd.startsWith('appbar'))return rejectReservation?'':JSON.stringify({bar:{x:0,y:1016,width:1920,height:64},work:display.workArea});if(cmd==='list')return '{"wins":[],"fg":"0","full":false}';return 'ok'}}
  const imports={electron:{app,BrowserWindow:Win,screen,shell:{},globalShortcut:{register(){}},powerMonitor:new EventEmitter()},'node:fs':{readFileSync:()=>'{"on":false}',writeFileSync(){}},'./winhelper.cjs':winh,'./mode.cjs':{mode:()=> 'desktop',isPrimary:()=>primary,workArea:()=>display.workArea},'./coalesced-runner.cjs':{coalescedRunner}}
  const module={exports:{}}
  new Function('require','module','exports','__dirname','process','setTimeout','clearTimeout','setInterval','clearInterval',fs.readFileSync(path.join(__dirname,'../electron/bar.cjs'),'utf8'))((n)=>imports[n]||require(n),module,module.exports,path.join(__dirname,'../electron'),{platform:'win32',env:{},execPath:'agenda.exe'},setTimeout,clearTimeout,setInterval,clearInterval)
  module.exports.register({handle:(n,fn)=>handlers.set(n,fn),on(){}},()=>null)
  return {call:(n,...args)=>handlers.get(n)(null,...args),windows,commands,native,app,setReject:(v)=>{rejectReservation=v},setPrimary:(v)=>{primary=v}}
}

test('AppBar activation is confirmed only after native reservation; renderer loss restores Explorer', async () => {
  const h=barHarness()
  const enabled=await h.call('bar:set',{on:true})
  assert.equal(enabled.active,true);assert.ok(h.commands.some(c=>c.startsWith('appbar 123 3 ')))
  h.windows[0].webContents.emit('render-process-gone')
  await drain()
  const failed=await h.call('bar:get');assert.equal(failed.active,false);assert.ok(failed.error)
  assert.ok(h.commands.includes('restore'))
  await h.call('bar:set',{on:false})
})

test('failed AppBar reservation leaves internal navigation available and can be retried', async () => {
  const h=barHarness();h.setReject(true)
  let state=await h.call('bar:set',{on:true})
  assert.equal(state.active,false);assert.ok(state.error);assert.equal(h.windows[0].dead,true)
  h.setReject(false);state=await h.call('bar:set',{on:true});assert.equal(state.active,true)
  await h.call('bar:set',{on:false});assert.equal((await h.call('bar:get')).active,false)
})

test('secondary monitor never hides the primary Windows taskbar', async () => {
  const h=barHarness();h.setPrimary(false)
  const state=await h.call('bar:set',{on:true})
  assert.equal(state.available,false);assert.equal(state.active,false);assert.equal(h.windows.length,0)
  assert.equal(h.commands.some(c=>c.startsWith('appbar')),false)
})

test('off/on during startup waits for a fresh bar instead of leaving activation stranded', async () => {
  const h=barHarness({holdReady:true})
  const first=h.call('bar:set',{on:true})
  const off=h.call('bar:set',{on:false})
  const second=h.call('bar:set',{on:true})
  await drain()
  assert.equal(h.windows.length,2);assert.equal(h.windows[0].dead,true)
  assert.equal(h.commands.some(c=>c.startsWith('appbar')),false)
  h.windows[1].emit('ready-to-show')
  await Promise.all([first,off,second])
  assert.equal((await h.call('bar:get')).active,true)
  await h.call('bar:set',{on:false})
})

test('quitting during a cancelled startup prevents a queued activation from reopening the bar', async () => {
  const h=barHarness({holdReady:true})
  const first=h.call('bar:set',{on:true})
  const off=h.call('bar:set',{on:false})
  const second=h.call('bar:set',{on:true})
  h.app.emit('before-quit')
  await Promise.all([first,off,second])
  assert.equal(h.windows.length,1);assert.equal(h.windows[0].dead,true)
  assert.equal((await h.call('bar:get')).active,false)
  assert.equal(h.commands.some(c=>c.startsWith('appbar')),false)
})
