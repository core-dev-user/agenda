const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const fs=require('node:fs');const path=require('node:path');
function harness(name){
 const app=new EventEmitter(),children=[];
 const imports={electron:{app},'node:fs':{writeFileSync(){}},'node:child_process':{spawn(){const c=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();c.stdin={write(){},end(){}};c.kill=()=>c.emit('exit',1);children.push(c);return c}}};
 const module={exports:{}};new Function('require','module','exports','process',fs.readFileSync(path.join(__dirname,'../electron',name),'utf8'))(n=>imports[n]||require(n),module,module.exports,{platform:'win32'});
 return {api:module.exports,children,app};
}
test('helper exiting before ready settles the original caller',async()=>{const h=harness('winhelper.cjs');const call=h.api.call('list');h.children[0].emit('exit',1);assert.equal(await call,'')});
test('failed PowerShell spawn settles callers and permits retry',async()=>{const h=harness('winhelper.cjs');const a=h.api.call('list');h.children[0].emit('error',new Error('blocked'));assert.equal(await a,'');const b=h.api.call('list');h.children[1].stdout.emit('data','{"ready":true}\n');await Promise.resolve();h.children[1].stdout.emit('data','snapshot\n');assert.equal(await b,'snapshot');h.children[1].emit('exit',0)});
test('native command timeout rejects the entire FIFO to prevent reply mixups',async t=>{t.mock.timers.enable({apis:['setTimeout']});const h=harness('winhelper.cjs');const a=h.api.call('list');h.children[0].stdout.emit('data','{"ready":true}\n');await Promise.resolve();t.mock.timers.tick(5000);assert.equal(await a,'')});
test('keyboard process routes supported events and can restart after failure',()=>{const h=harness('keys.cjs'),events=[];h.api.onKey(e=>events.push(e));h.api.enable(true);h.children[0].stdout.emit('data','start\nsearch\nsettings\nnotifications\nassistant\npin:0\npin:8\npin:9\n');assert.deepEqual(events,['start','search','settings','notifications','assistant','pin:0','pin:8']);h.children[0].emit('error',new Error('blocked'));h.api.enable(true);assert.equal(h.children.length,2);h.children[1].emit('exit',0)});
test('late exit of old helper does not drain new process replies',async()=>{
 const h=harness('winhelper.cjs');const a=h.api.call('list');const old=h.children[0];old.emit('error',new Error('blocked'));assert.equal(await a,'');
 const b=h.api.call('list');const next=h.children[1];next.stdout.emit('data','{"ready":true}\n');await Promise.resolve();old.emit('exit',1);next.stdout.emit('data','new snapshot\n');assert.equal(await b,'new snapshot');next.emit('exit',0);
});
test('late keyboard exit cannot disable its replacement',()=>{
 const h=harness('keys.cjs');h.api.enable(true);const old=h.children[0];old.emit('error',new Error('blocked'));h.api.enable(true);old.emit('exit',1);h.api.enable(true);assert.equal(h.children.length,2);h.children[1].emit('exit',0);
});
