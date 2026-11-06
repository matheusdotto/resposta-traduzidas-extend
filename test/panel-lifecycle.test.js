const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const answers=require('../src/answers.js'),status=require('../src/status.js');
function setup(){
 let observer,created=0;const docEvents={},winEvents={},runtimeEvents=[];
 class Element{
  constructor(){this.children=[];this.parentNode=null;this.dataset={};this.classList={toggle(){}};this.controls=new Map();this.textContent='';}
  appendChild(child){if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);this.children.push(child);child.parentNode=this;return child;}
  removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;}
  get isConnected(){return this===doc.documentElement||Boolean(this.parentNode?.isConnected);}
  attachShadow(){return new Element();}
  querySelector(selector){if(!this.controls.has(selector))this.controls.set(selector,new Element());return this.controls.get(selector);}
  addEventListener(){}setAttribute(){}
 }
 const doc={readyState:'complete',documentElement:new Element(),fullscreenElement:null,createElement(){created++;return new Element()},addEventListener:(name,fn)=>docEvents[name]=fn};
 const window={addEventListener:(name,fn)=>winEvents[name]=fn};
 const sandbox={window,document:doc,chrome:{storage:{local:{get:async()=>({}),set:async()=>{}}},runtime:{onMessage:{addListener:fn=>runtimeEvents.push(fn)},sendMessage:async()=>{}}},
  RespostasAnswers:answers,RespostasStatus:status,RespostasPanelDom:{createPanelDom(){},enablePanelDrag:()=>({place(){},keepInside(){}})},RespostasCapture:{createTabCapture:()=>({start:async()=>true,stop(){}})},
  VozSessionManager:{createSessionManager:()=>({start(){},stop(){},sendAudio(){}})},VozGemini:{createSession(){}},
  MutationObserver:class{constructor(fn){this.callback=fn;observer=this}observe(){}disconnect(){}},setTimeout,clearTimeout};
 const context=vm.createContext(sandbox),source=fs.readFileSync(path.join(__dirname,'../src/content.js'),'utf8');
 vm.runInContext(source,context);return{doc,docEvents,runtimeEvents,observer,Element,context,source,created:()=>created};
}
test('painel removido pela aplicação é recolocado e acompanha tela cheia',async()=>{
 const h=setup();await Promise.resolve();const host=h.doc.documentElement.children[0];assert.ok(host);
 h.doc.documentElement.removeChild(host);h.observer.callback();assert.equal(host.parentNode,h.doc.documentElement);
 const fullscreen=new h.Element();h.doc.documentElement.appendChild(fullscreen);h.doc.fullscreenElement=fullscreen;h.docEvents.fullscreenchange();assert.equal(host.parentNode,fullscreen);
 h.doc.fullscreenElement=null;h.docEvents.fullscreenchange();assert.equal(host.parentNode,h.doc.documentElement);
});
test('reinjeção e clique no ícone reutilizam o painel sem nova sessão',()=>{
 const h=setup();const before=h.created();vm.runInContext(h.source,h.context);assert.equal(h.created(),before);assert.equal(h.runtimeEvents.length,1);
 let response;h.runtimeEvents[0]({type:'show-panel'},{},r=>response=r);assert.equal(response.ok,true);assert.equal(h.created(),before);
});
