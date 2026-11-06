const test=require('node:test'),assert=require('node:assert/strict');
const {createPanelDom}=require('../src/panel-dom.js');
class Element{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.attributes={};}
 set innerHTML(value){throw Error('TrustedHTML required');}
 setAttribute(name,value){this.attributes[name]=value;}
 appendChild(child){this.children.push(child);return child;}
 querySelectorAll(selector){const found=[];function walk(node,inLanguages=false){inLanguages ||= (node.attributes?.class||'').split(' ').includes('languages');if(node.tag==='select'&&(!selector||inLanguages))found.push(node);for(const child of node.children||[])walk(child,inLanguages)}walk(this);return found;}
}
test('painel é construído mesmo quando sinks HTML são bloqueados',()=>{
 const doc={createElement:tag=>new Element(tag,doc),createTextNode:text=>({textContent:text})};const root=new Element('root',doc);
 createPanelDom(root,{en:'Inglês','pt-BR':'Português (Brasil)'});
 assert.equal(root.children[0].tag,'style');const selects=root.querySelectorAll('.languages select');assert.equal(selects.length,2);
 for(const select of selects){assert.equal(select.children.length,2);assert.equal(select.children[1].textContent,'Português (Brasil)');assert.equal(select.children[1].value,'pt-BR');}
 assert.equal(root.children[1].attributes.class,'panel');
});

test('aviso e controles permanecem dentro do corpo recolhível do painel',()=>{
 const doc={createElement:tag=>new Element(tag,doc),createTextNode:text=>({textContent:text})};const root=new Element('root',doc);createPanelDom(root,{en:'Inglês'});
 const panel=root.children[1];assert.equal(panel.children.length,2);
 const body=panel.children[1],notice=body.children.find(n=>n.attributes?.class==='notice-row');
 assert.equal(notice.children[0].tag,'label');assert.ok(notice.children[0].children.some(n=>n.textContent?.includes('Avisei')));
 assert.equal(notice.children[1].attributes.class,'copy-notice');assert.ok(body.children.some(n=>n.attributes?.class==='toggle'));
 const capture=root.querySelectorAll().find(n=>n.attributes.class==='capture-source');assert.equal(capture.children.length,2);
});
