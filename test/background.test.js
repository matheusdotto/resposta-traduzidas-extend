const test=require('node:test'),assert=require('node:assert/strict');
const {supportedUrl,createPanelActions}=require('../background.js');
function setup(loaded=false,blocked=false){const calls=[];let messages=0;
 const api={runtime:{openOptionsPage:async()=>calls.push('options'),getManifest:()=>({content_scripts:[{js:['a.js','b.js']}]})},
 tabs:{sendMessage:async()=>{messages++;if(messages===1&&!loaded)throw Error('no listener');return{ok:true}}},
 scripting:{executeScript:async v=>{calls.push(v);if(blocked)throw Error('acesso negado')}},action:{setBadgeText:async v=>calls.push(v),setTitle:async v=>calls.push(v)}};
 return{actions:createPanelActions(api),calls};
}
test('reconhece raízes e subdomínios do Teams sem aceitar sites parecidos',()=>{
 for(const host of ['teams.microsoft.com','teams.cloud.microsoft','teams.live.com','www.teams.microsoft.com','meetings.teams.cloud.microsoft'])assert.equal(supportedUrl('https://'+host+'/v2'),true);
 for(const url of ['https://teams.microsoft.com.example.org','https://evilteams.microsoft.com','http://teams.microsoft.com','https://example.org'])assert.equal(supportedUrl(url),false);
});
test('reconhece o cliente web do Zoom sem aceitar outras páginas',()=>{
 for(const url of ['https://app.zoom.us/wc/123/join','https://zoom.us/wc/join/123','https://empresa.zoom.us/wc/123/start'])assert.equal(supportedUrl(url),true,url);
 for(const url of ['https://zoom.us/profile','https://zoom.us/wc','https://zoom.us.example.org/wc/1','https://notzoom.us/wc/1','http://zoom.us/wc/1'])assert.equal(supportedUrl(url),false,url);
});
test('ícone abre configurações fora de páginas de reunião',async()=>{const h=setup();await h.actions.click({id:1,url:'https://example.org'});assert.deepEqual(h.calls,['options']);});
test('ícone recupera painel ausente no Teams usando scripts do manifest',async()=>{
 const h=setup();await h.actions.click({id:4,url:'https://meetings.teams.microsoft.com/'});
 assert.deepEqual(h.calls[0],{target:{tabId:4,frameIds:[0]},files:['a.js','b.js']});assert.equal(h.calls.at(-1).text,'');
});
test('ícone reaproveita painel existente sem reinjetar scripts',async()=>{const h=setup(true);await h.actions.click({id:4,url:'https://teams.cloud.microsoft/'});assert.equal(h.calls.length,1);assert.equal(h.calls[0].text,'');});
test('falha de acesso mostra indicador e motivo em vez de abrir janela',async()=>{
 const h=setup(false,true);const old=console.error;console.error=()=>{};try{await h.actions.click({id:4,url:'https://teams.microsoft.com/'});}finally{console.error=old}
 assert.ok(h.calls.some(v=>v.text==='!'));assert.ok(h.calls.some(v=>v.title?.includes('acesso negado')));
});

test('OpenAI usa apenas sua chave e encaminha o texto em partes', async () => {
 const {handleOpenAIAnswer}=require('../background.js');
 const sent=[];
 let receive;
 const port={onDisconnect:{addListener(){}},onMessage:{addListener(fn){receive=fn;}},postMessage(value){sent.push(value);}};
 handleOpenAIAnswer(port,{get:async()=>({openaiKey:'chave-openai',apiKey:'chave-gemini'})},async (url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(options.headers.Authorization,'Bearer chave-openai');
  const body=JSON.parse(options.body);
  assert.equal(body.instructions,'Currículo');
  assert.equal(body.input,'Pergunta');
  assert.equal(body.stream,true);
  return new Response('data: {"type":"response.output_text.delta","delta":"Olá"}\n\ndata: {"type":"response.completed"}\n\n');
 });
 await receive({instructions:'Currículo',input:'Pergunta'});
 assert.deepEqual(sent,[{text:'Olá'},{done:true}]);
});
