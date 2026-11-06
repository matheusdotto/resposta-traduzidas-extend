const test=require('node:test'),assert=require('node:assert/strict');
const {enablePanelDrag}=require('../src/panel-dom.js');
function setup(){
 const listeners={},viewListeners={},box={left:16,top:16,width:400,height:300},saved=[];
 const panel={style:{},getBoundingClientRect:()=>({...box,left:parseFloat(panel.style.left??box.left),top:parseFloat(panel.style.top??box.top)})};
 const handle={addEventListener:(n,f)=>listeners[n]=f,setPointerCapture(){}};
 const view={innerWidth:1000,innerHeight:700,addEventListener:(n,f)=>viewListeners[n]=f};
 const drag=enablePanelDrag({panel,handle,view,onMove:p=>saved.push(p)});
 const fire=(name,x,y,extra={})=>listeners[name]({pointerId:1,button:0,clientX:x,clientY:y,target:{closest:()=>null},preventDefault(){},...extra});
 return{panel,box,view,viewListeners,saved,drag,fire};
}
test('arrastar a barra move o painel mantendo o ponto segurado e salva ao soltar',()=>{
 const h=setup();h.fire('pointerdown',26,26);h.fire('pointermove',110,210);
 assert.equal(h.panel.style.left,'100px');assert.equal(h.panel.style.top,'200px');assert.deepEqual(h.saved,[]);
 h.fire('pointerup',110,210);assert.deepEqual(h.saved,[{left:100,top:200}]);
});
test('o painel não sai da área visível em nenhum dos lados',()=>{
 const h=setup();h.fire('pointerdown',16,16);
 h.fire('pointermove',-500,-500);assert.deepEqual([h.panel.style.left,h.panel.style.top],['0px','0px']);
 h.fire('pointermove',5000,5000);assert.deepEqual([h.panel.style.left,h.panel.style.top],['600px','400px']);
});
test('clicar em botão da barra não inicia arrasto, e clique sem mover não salva',()=>{
 const h=setup();h.fire('pointerdown',20,20,{target:{closest:()=>({})}});h.fire('pointermove',300,300);assert.equal(h.panel.style.left,undefined);
 h.fire('pointerdown',20,20);h.fire('pointerup',20,20);assert.deepEqual(h.saved,[]);
 h.fire('pointerdown',20,20,{button:2});h.fire('pointermove',300,300);assert.deepEqual(h.saved,[]);
});
test('janela menor ou painel maior trazem de volta a posição salva',()=>{
 const h=setup();h.drag.place(600,400);h.view.innerWidth=800;h.viewListeners.resize();assert.equal(h.panel.style.left,'400px');
 h.box.height=500;h.drag.keepInside();assert.equal(h.panel.style.top,'200px');
});
test('posição salva inválida é ignorada',()=>{
 const h=setup();h.drag.place(undefined,'x');assert.equal(h.panel.style.left,undefined);
});
