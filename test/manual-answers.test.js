const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const answers=require('../src/answers.js'),status=require('../src/status.js');
function setup(stored={}){
 let root,sessionEvent,captureCallbacks,pauseCallback,pendingPause=false,noteCalls=0,cancels=0;const requests=[],writes=[],winEvents={};
 class Element{
  constructor(){this.children=[];this.parentNode=null;this.dataset={};this.classList={toggle(){}};this.controls=new Map();this.textContent='';this.events={};this.scrollTop=0;this.clientHeight=0;this.scrollHeight=0;}
  appendChild(child){child.parentNode=this;this.children.push(child);return child;}
  get isConnected(){return Boolean(this.parentNode)||this===doc.documentElement;}
  attachShadow(){root=new Element();return root;}
  querySelector(selector){if(!this.controls.has(selector))this.controls.set(selector,new Element());return this.controls.get(selector);}
  addEventListener(type,fn){this.events[type]=fn;}setAttribute(){}
 }
 const doc={readyState:'complete',documentElement:new Element(),createElement:()=>new Element(),addEventListener(){}};
 const local={get:async()=>({apiKey:'k',...stored}),set:async value=>{writes.push(value);Object.assign(stored,value);}};
 const sandbox={window:{addEventListener:(name,fn)=>winEvents[name]=fn},document:doc,navigator:{clipboard:{writeText:async()=>{}}},
  chrome:{storage:{local},runtime:{onMessage:{addListener(){}},sendMessage:async()=>{}}},
  RespostasAnswers:{...answers,createPauseTrigger:({onPause})=>{pauseCallback=onPause;return {noteSpeech(){pendingPause=true;noteCalls++;},stop(){pendingPause=false;}};},createAnswerClient:()=>({generate(request,callbacks){requests.push({request,callbacks});},cancel(){cancels++;}})},
  RespostasStatus:status,RespostasPanelDom:{createPanelDom(){},enablePanelDrag:()=>({place(){},keepInside(){}})},
  RespostasCapture:{createTabCapture:callbacks=>{captureCallbacks=callbacks;return {start:async()=>true,stop(){}};}},
  VozSessionManager:{createSessionManager:({onEvent})=>{sessionEvent=onEvent;return {start(){onEvent({type:'ready'});},stop(){},sendAudio(){}};}},VozGemini:{createSession(){}},
  MutationObserver:class{observe(){}disconnect(){}},setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/content.js'),'utf8'),sandbox);
 return {q:selector=>root.querySelector(selector),emit:event=>sessionEvent(event),pause:()=>{pendingPause=false;pauseCallback();},capture:()=>captureCallbacks,requests,writes,winEvents,
 get pendingPause(){return pendingPause;},get notes(){return noteCalls;},get cancels(){return cancels;}};
}
async function start(h){await Promise.resolve();h.q('.notice').checked=true;h.q('.notice').events.change();h.q('.toggle').events.click();await new Promise(r=>setImmediate(r));}
function manual(h,value){h.q('.manual-answers').checked=value;h.q('.manual-answers').events.change();}
test('desmarcado mantém resposta automática após pausa',async()=>{
 const h=setup();await start(h);assert.equal(h.q('.manual-answers').checked,false);h.emit({type:'inputText',text:'What are you doing at Bradesco?'});assert.equal(h.pendingPause,true);h.pause();assert.equal(h.requests.length,1);assert.equal(h.requests[0].request.force,false);h.winEvents.pagehide();
});
test('marcado transcreve e traduz mas só gera após clique, com pergunta inteira',async()=>{
 const h=setup();await start(h);manual(h,true);h.emit({type:'inputText',text:'Hello. What are you doing for a living?'});h.emit({type:'outputText',text:'Olá. O que você faz?'});
 assert.match(h.q('.original').textContent,/for a living/);assert.match(h.q('.translated').textContent,/O que você faz/);assert.equal(h.pendingPause,false);
 h.capture().onAudio('PCM',true);h.pause();assert.equal(h.requests.length,0);
 h.q('.answer-now').events.click();assert.equal(h.requests.length,1);assert.equal(h.requests[0].request.latest,'Hello. What are you doing for a living?');assert.equal(h.requests[0].request.force,true);h.winEvents.pagehide();
});
test('preferência é salva e restaurada na próxima abertura',async()=>{
 const stored={},h=setup(stored);await start(h);manual(h,true);assert.equal(h.writes.at(-1).manualAnswers,true);h.winEvents.pagehide();
 const next=setup(stored);await start(next);assert.equal(next.q('.manual-answers').checked,true);next.emit({type:'inputText',text:'Tell me about yourself.'});next.pause();assert.equal(next.requests.length,0);next.winEvents.pagehide();
});
test('marcar durante espera cancela disparo e desmarcar volta a agendar',async()=>{
 const h=setup();await start(h);h.emit({type:'inputText',text:'Explain Java streams.'});assert.equal(h.pendingPause,true);manual(h,true);assert.equal(h.pendingPause,false);h.pause();assert.equal(h.requests.length,0);
 manual(h,false);assert.equal(h.pendingPause,true);h.pause();assert.equal(h.requests.length,1);h.winEvents.pagehide();
});
test('marcar durante geração cancela pedido e preserva pergunta para clique',async()=>{
 const h=setup();await start(h);h.emit({type:'inputText',text:'Explain transactions.'});h.pause();assert.equal(h.requests.length,1);manual(h,true);assert.equal(h.cancels,1);h.pause();assert.equal(h.requests.length,1);
 h.q('.answer-now').events.click();assert.equal(h.requests.length,2);assert.equal(h.requests[1].request.latest,'Explain transactions.');h.winEvents.pagehide();
});
test('limpar remove fala pendente e impede geração vazia no modo manual',async()=>{
 const h=setup({manualAnswers:true});await start(h);h.emit({type:'inputText',text:'What is REST?'});h.q('.clear').events.click();h.q('.answer-now').events.click();assert.equal(h.requests.length,0);assert.equal(h.q('.original').textContent,'');h.winEvents.pagehide();
});
