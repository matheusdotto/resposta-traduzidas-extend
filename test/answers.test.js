const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRequest,
  splitAnswer,
  createAnswerClient,
  createPauseTrigger,
} = require("../src/answers.js");

const REQUEST = {
  recent: "Conversa anterior.",
  latest: "What is the deadline?",
  context: "Sou gerente do projeto X.",
  theirLanguage: "en",
  myLanguage: "pt-BR",
  force: false,
};

function sseResponse(chunks, { status = 200 } = {}) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status }
  );
}

const event = (text) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;

function run(client, request = REQUEST) {
  return new Promise((resolve) => {
    const seen = { texts: [], errors: [] };
    client.generate(request, {
      onText: (text) => seen.texts.push(text),
      onDone: () => resolve(seen),
      onError: (message) => {
        seen.errors.push(message);
        resolve(seen);
      },
    });
  });
}

test("buildRequest inclui fala, contexto e os dois idiomas", () => {
  const body = JSON.stringify(buildRequest(REQUEST));
  for (const text of ["What is the deadline?", "Conversa anterior.", "projeto X", "Inglês", "Português"]) {
    assert.ok(body.includes(text), text);
  }
  assert.ok(body.includes("SEM_PERGUNTA"));
});

test("buildRequest forçado não permite recusar a resposta", () => {
  const prompt = JSON.stringify(buildRequest({ ...REQUEST, force: true }));
  assert.ok(!prompt.includes("SEM_PERGUNTA"));
});

test("buildRequest pede para não inventar fatos", () => {
  assert.match(JSON.stringify(buildRequest(REQUEST)), /[Nn]ão invente/);
});

test("splitAnswer separa os dois idiomas", () => {
  assert.deepEqual(splitAnswer("[[ELES]]\nBy Friday.\n[[EU]]\nAté sexta."), {
    noQuestion: false,
    theirs: "By Friday.",
    mine: "Até sexta.",
  });
});

test("splitAnswer mostra a primeira parte enquanto a segunda não chegou", () => {
  assert.deepEqual(splitAnswer("[[ELES]]\nBy Fri"), {
    noQuestion: false,
    theirs: "By Fri",
    mine: "",
  });
});

test("splitAnswer reconhece quando não houve pergunta", () => {
  assert.equal(splitAnswer("SEM_PERGUNTA").noQuestion, true);
  assert.equal(splitAnswer("  SEM_PERGUNTA\n").noQuestion, true);
});

test("splitAnswer não mostra um marcador incompleto nem um começo de SEM_PERGUNTA", () => {
  assert.deepEqual(splitAnswer("SEM_PER"), { noQuestion: false, theirs: "", mine: "" });
  assert.equal(splitAnswer("[[ELES]]\nBy Friday.\n[[E").theirs, "By Friday.");
});

test("generate usa o endpoint de streaming e envia a chave em cabeçalho", async () => {
  let url;
  let init;
  const client = createAnswerClient({
    apiKey: "segredo",
    fetchImpl: async (u, i) => {
      url = u;
      init = i;
      return sseResponse([event("ok")]);
    },
  });
  await run(client);
  assert.equal(
    url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse"
  );
  assert.equal(init.headers["x-goog-api-key"], "segredo");
  assert.ok(!url.includes("segredo"));
});

test("generate acumula o texto recebido", async () => {
  const client = createAnswerClient({
    apiKey: "k",
    fetchImpl: async () => sseResponse([event("By "), event("Friday")]),
  });
  assert.deepEqual((await run(client)).texts, ["By ", "By Friday"]);
});

test("generate não perde texto quando um evento chega dividido", async () => {
  const whole = event("Inteiro");
  const client = createAnswerClient({
    apiKey: "k",
    fetchImpl: async () => sseResponse([whole.slice(0, 15), whole.slice(15)]),
  });
  assert.deepEqual((await run(client)).texts, ["Inteiro"]);
});

test("generate informa o erro da API sem expor a chave", async () => {
  const client = createAnswerClient({
    apiKey: "segredo",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: "Chave segredo recusada" } }), { status: 403 }),
  });
  const { errors } = await run(client);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("recusada"));
  assert.ok(!errors[0].includes("segredo"));
});

test("generate informa uma falha de rede", async () => {
  const client = createAnswerClient({
    apiKey: "k",
    fetchImpl: async () => {
      throw new Error("sem rede");
    },
  });
  assert.equal((await run(client)).errors.length, 1);
});

test("uma nova resposta cancela a anterior, que não escreve mais nada", async () => {
  const pending = [];
  const client = createAnswerClient({
    apiKey: "k",
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("cancelado", "AbortError"))
        );
        pending.push(resolve);
      }),
  });
  const old = { texts: [], errors: [], done: 0 };
  client.generate(REQUEST, {
    onText: (t) => old.texts.push(t),
    onDone: () => old.done++,
    onError: (m) => old.errors.push(m),
  });
  const next = new Promise((resolve) => {
    const texts = [];
    client.generate(REQUEST, {
      onText: (t) => texts.push(t),
      onDone: () => resolve(texts),
      onError: resolve,
    });
  });
  pending[1](sseResponse([event("novo")]));
  assert.deepEqual(await next, ["novo"]);
  assert.deepEqual(old, { texts: [], errors: [], done: 0 });
});

function trigger() {
  const timers = [];
  let pauses = 0;
  const instance = createPauseTrigger({
    schedule: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      timer.cancelled = true;
    },
    onPause: () => pauses++,
  });
  return { instance, timers, pauses: () => pauses };
}

test("createPauseTrigger espera 1,2 s depois da última fala", () => {
  const { instance, timers, pauses } = trigger();
  instance.noteSpeech();
  instance.noteSpeech();
  assert.equal(timers[0].cancelled, true);
  assert.equal(timers[1].ms, 1200);
  timers[1].fn();
  assert.equal(pauses(), 1);
});

test("stop cancela a pausa pendente", () => {
  const { instance, timers } = trigger();
  instance.noteSpeech();
  instance.stop();
  assert.equal(timers[0].cancelled, true);
});

test("splitAnswer reconhece SEM_PERGUNTA dentro do formato", () => {
  const answer = splitAnswer("[[ELES]]\nSEM_PERGUNTA\n[[EU]]\nSEM_PERGUNTA");
  assert.equal(answer.noQuestion, true);
  assert.equal(answer.theirs, "");
});

test("splitAnswer não mostra um começo de SEM_PERGUNTA dentro do formato", () => {
  assert.equal(splitAnswer("[[ELES]]\nSEM_").theirs, "");
});

test("splitAnswer mantém uma lacuna entre colchetes no fim da resposta", () => {
  assert.equal(splitAnswer("[[ELES]]\nBy [DATE]\n[[EU]]\nSai em [DATA]").mine, "Sai em [DATA]");
  assert.equal(splitAnswer("[[ELES]]\nBy [DATE]").theirs, "By [DATE]");
});

test("buildRequest diz que SEM_PERGUNTA não usa o formato", () => {
  assert.match(JSON.stringify(buildRequest(REQUEST)), /ignore o formato/);
});

test("generate informa um erro enviado dentro do streaming", async () => {
  const client = createAnswerClient({
    apiKey: "segredo",
    fetchImpl: async () =>
      sseResponse([`data: ${JSON.stringify({ error: { message: "Falhou segredo" } })}\n\n`]),
  });
  const { errors } = await run(client);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("Falhou"));
  assert.ok(!errors[0].includes("segredo"));
});

test("generate informa quando o Gemini bloqueia a resposta", async () => {
  const client = createAnswerClient({
    apiKey: "k",
    fetchImpl: async () =>
      sseResponse([`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}\n\n`]),
  });
  const { errors } = await run(client);
  assert.match(errors[0], /bloqueou/);
  assert.match(errors[0], /SAFETY/);
});

test("generate lê um caractere dividido entre pedaços da rede", async () => {
  const bytes = new TextEncoder().encode(event("preço"));
  const cut = bytes.indexOf(0xc3) + 1;
  const client = createAnswerClient({
    apiKey: "k",
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, cut));
            controller.enqueue(bytes.slice(cut));
            controller.close();
          },
        })
      ),
  });
  assert.deepEqual((await run(client)).texts, ["preço"]);
});

test('o pedido recebe currículo e instruções de entrevista automaticamente', () => {
  require('../src/interview-prompt.js');
  const request = buildRequest({recent:'', latest:'Tell me about yourself', theirLanguage:'en', myLanguage:'pt-BR'});
  const instructions = request.systemInstruction.parts[0].text;
  for(const text of ["Sou Matheus Otto", "Bradesco", "Mainframe B4", "Spring Boot", "Não invente métricas"])assert.ok(instructions.includes(text),text);
  assert.match(instructions, /Não invente fatos/);
});
test('o contexto da reunião só entra quando foi configurado', () => {
  const request = buildRequest({recent:'', latest:'When is the deadline?', context:'Projeto Atlas, entrega em março', theirLanguage:'en', myLanguage:'pt-BR'});
  assert.match(request.systemInstruction.parts[0].text, /Projeto Atlas, entrega em março/);
});

test('alta demanda tenta novamente com espera progressiva e preserva o corpo', async () => {
  const waits=[],bodies=[];let calls=0;
  const client=createAnswerClient({apiKey:'k',random:()=>0,waitImpl:async ms=>waits.push(ms),fetchImpl:async(u,init)=>{
    bodies.push(init.body);calls++;
    return calls<3?new Response(JSON.stringify({error:{message:'high demand'}}),{status:503}):sseResponse([event('ok')]);
  }});
  const result=await run(client);assert.deepEqual(waits,[1000,2000]);assert.equal(calls,3);assert.deepEqual(result.texts,['ok']);assert.ok(bodies.every(b=>b===bodies[0]));
});
test('429 respeita Retry-After em vez de repetir imediatamente', async () => {
  const waits=[];let calls=0;
  const client=createAnswerClient({apiKey:'k',random:()=>0,waitImpl:async ms=>waits.push(ms),fetchImpl:async()=>++calls===1?
    new Response(JSON.stringify({error:{message:'rate limit'}}),{status:429,headers:{'Retry-After':'5'}}):sseResponse([event('ok')])});
  await run(client);assert.deepEqual(waits,[5000]);
});
test('erro permanente não é repetido e falha transitória tem limite', async () => {
  for(const status of [403,503]){
    let calls=0;const client=createAnswerClient({apiKey:'k',waitImpl:async()=>{},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{message:'falhou'}}),{status})}});
    const result=await run(client);assert.equal(calls,status===403?1:3);assert.equal(result.errors.length,1);
  }
});
test('erro transitório dentro do streaming reinicia a resposta sem juntar o texto parcial', async () => {
  let calls=0;
  const client=createAnswerClient({apiKey:'k',waitImpl:async()=>{},fetchImpl:async()=>++calls===1?
    sseResponse([event('parcial'), 'data: '+JSON.stringify({error:{code:503,message:'high demand'}})+'\n\n']):sseResponse([event('completa')])});
  const result=await run(client);assert.deepEqual(result.texts,['parcial','completa']);assert.equal(result.errors.length,0);
});
test('cancelar durante a espera impede uma nova requisição', async () => {
  let calls=0,release;const old={done:0,errors:0};
  const waiting=new Promise(resolve=>release=resolve);
  const client=createAnswerClient({apiKey:'k',waitImpl:()=>waiting,fetchImpl:async()=>{calls++;return new Response('{}',{status:503})}});
  let retry;const reached=new Promise(resolve=>retry=resolve);
  client.generate(REQUEST,{onText(){},onDone:()=>old.done++,onError:()=>old.errors++,onRetry:()=>retry()});
  await reached;client.cancel();release();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.deepEqual(old,{done:0,errors:0});
});

test('cumprimento gera apenas saudação, sem consultar o modelo',async()=>{
 let calls=0;const client=createAnswerClient({apiKey:'k',fetchImpl:async()=>{calls++;throw Error('não deve chamar')}});
 const result=await run(client,{...REQUEST,latest:'Hello. Hello, everyone.'});
 assert.equal(calls,0);assert.deepEqual(splitAnswer(result.texts.at(-1)),{noQuestion:false,theirs:'Hi!',mine:'Olá!'});
});
test('Responder agora não transforma cumprimento em apresentação',async()=>{
 const client=createAnswerClient({apiKey:'k',fetchImpl:async()=>{throw Error('não deve chamar')}});
 const result=await run(client,{...REQUEST,latest:'Hello there!',force:true});
 const reply=splitAnswer(result.texts.at(-1));assert.equal(reply.theirs,'Hi!');assert.equal(reply.mine,'Olá!');
});
test('cumprimentos curtos funcionam nos seis idiomas disponíveis',async()=>{
 const greetings={en:'Hello',es:'Hola','pt-BR':'Olá',fr:'Bonjour',de:'Hallo',it:'Ciao'};
 const client=createAnswerClient({apiKey:'k',fetchImpl:async()=>{throw Error('não deve chamar')}});
 for(const [language,greeting]of Object.entries(greetings)){
  const result=await run(client,{...REQUEST,latest:greeting,theirLanguage:language});
  const reply=splitAnswer(result.texts.at(-1));assert.ok(reply.theirs.length<15);assert.equal(reply.mine,'Olá!');
 }
});
test('saudação seguida de pergunta não é confundida com cumprimento puro',async()=>{
 let body;const client=createAnswerClient({apiKey:'k',fetchImpl:async(u,init)=>{body=JSON.parse(init.body);return sseResponse([event('[[ELES]]\nI work on the backoffice platform.\n[[EU]]\nTrabalho na plataforma de backoffice.')])}});
 const latest='Hello, when is the deadline?';const result=await run(client,{...REQUEST,latest});
 assert.ok(body.contents[0].parts[0].text.includes(latest));
 assert.equal(splitAnswer(result.texts.at(-1)).theirs,'I work on the backoffice platform.');
});
test('agradecimento simples recebe resposta social curta',async()=>{
 const client=createAnswerClient({apiKey:'k'});const result=await run(client,{...REQUEST,latest:'Thank you!'});
 assert.equal(splitAnswer(result.texts.at(-1)).theirs,"You're welcome.");
});
test('confirmação sem pergunta não inicia uma fala profissional',async()=>{
 const client=createAnswerClient({apiKey:'k'});const result=await run(client,{...REQUEST,latest:'Okay.'});
 assert.equal(splitAnswer(result.texts.at(-1)).noQuestion,true);
});
test('cumprimento cancela uma geração antiga em andamento sem aproveitar seu texto',async()=>{
 let aborted=false;const client=createAnswerClient({apiKey:'k',fetchImpl:(u,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('cancel','AbortError'))}))});
 const old={done:0,error:0};client.generate(REQUEST,{onText(){},onDone:()=>old.done++,onError:()=>old.error++});
 const result=await run(client,{...REQUEST,latest:'Hi there.'});await new Promise(r=>setImmediate(r));
 assert.equal(aborted,true);assert.equal(splitAnswer(result.texts.at(-1)).theirs,'Hi!');assert.deepEqual(old,{done:0,error:0});
});

test('cumprimento seguido da pergunta do print consulta o modelo com currículo e pergunta completa',async()=>{
 const latest='Hello. What are you doing for a living?';let body,calls=0;
 const client=createAnswerClient({apiKey:'k',fetchImpl:async(url,init)=>{calls++;body=JSON.parse(init.body);return sseResponse([event('[[ELES]]\nI am a full-stack developer.\n[[EU]]\nSou desenvolvedor full stack.')]);}});
 const seen=await run(client,{...REQUEST,latest,context:'Informação adicional confirmada.'});
 assert.equal(calls,1);assert.deepEqual(seen.errors,[]);assert.match(body.systemInstruction.parts[0].text,/Sou Matheus Otto/);assert.match(body.systemInstruction.parts[0].text,/Informação adicional confirmada/);assert.match(body.contents[0].parts[0].text,/Hello\. What are you doing for a living\?/);
});
test('cumprimentos puros reconhecem nome e público sem apresentação profissional',async()=>{
 for(const latest of ['Hello. Hello, Mateus.','Hello everyone','Oi, Matheus Otto']){
  const client=createAnswerClient({apiKey:'k',fetchImpl:()=>{throw Error('Não consultar modelo em saudação pura.');}});
  const seen=await run(client,{...REQUEST,latest});assert.deepEqual(seen.texts,['[[ELES]]\nHi!\n[[EU]]\nOlá!']);
 }
});
test('regras restauradas limitam autobiografia e tecnologias fora do currículo',()=>{
 const prompt=buildRequest(REQUEST).systemInstruction.parts[0].text;
 for(const text of ['inglês americano','Não invente métricas','Kotlin','conhecimento conceitual','Estado civil','45 a 90 segundos']){
  if(text==='45 a 90 segundos')assert.ok(!prompt.includes('Por padrão, escreva uma resposta que eu consiga falar em 45 a 90 segundos'));
  else assert.ok(prompt.toLowerCase().includes(text.toLowerCase()),text);
 }
 assert.match(prompt,/1 a 3 frases/);
});
