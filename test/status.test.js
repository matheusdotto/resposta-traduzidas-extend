const test = require("node:test");
const assert = require("node:assert/strict");
const { statusText, answerStatusText, diagnosticText } = require("../src/status.js");

test("sem aviso marcado, explica o que falta", () => {
  assert.match(statusText({ connection: "off", noticeAccepted: false }).text, /Marque o aviso/);
});

test("desligada e com aviso marcado, está pronta", () => {
  assert.match(statusText({ connection: "off", noticeAccepted: true }).text, /Pronta/);
});

test("informa cada etapa da conexão", () => {
  assert.match(statusText({ connection: "connecting" }).text, /Conectando/);
  assert.match(statusText({ connection: "reconnecting" }).text, /Reconectando/);
  assert.match(statusText({ connection: "translating" }).text, /Procurando/);
  assert.match(statusText({ connection: "translating", tracks: 2, hearing: true }).text, /Ouvindo/);
  assert.match(statusText({ connection: "translating", tracks: 2, hearing: false }).text, /Aguardando/);
});

test("sem áudio da chamada e em falhas, mostra erro", () => {
  assert.equal(statusText({ connection: "translating", tracks: 0 }).isError, true);
  const failed = statusText({ connection: "failed", reason: "Cota esgotada." });
  assert.equal(failed.isError, true);
  assert.match(failed.text, /Cota esgotada\./);
  assert.equal(statusText({ connection: "no-key" }).isError, true);
});

test("a área de respostas informa o próprio estado", () => {
  assert.match(answerStatusText({ state: "idle" }).text, /Rascunho/);
  assert.match(answerStatusText({ state: "generating" }).text, /Gerando/);
  const failed = answerStatusText({ state: "failed", reason: "Cota." });
  assert.equal(failed.isError, true);
  assert.match(failed.text, /Cota\./);
});

test("o diagnóstico resume som, envio, respostas e reconexões", () => {
  assert.equal(
    diagnosticText({ peak: 0.5, sentFrames: 120, responses: 3, reconnects: 1, contextState: "running" }),
    "Pico de som: 0,5000 · Enviado: 12 s · Respostas: 3 · Reconexões: 1 · Áudio: running"
  );
  assert.equal(diagnosticText({ responses: 0, reconnects: 0 }), "");
});

test("o diagnóstico mostra quantas faixas estão sem mídia", () => {
  assert.match(
    diagnosticText({
      peak: 0,
      sentFrames: 0,
      responses: 0,
      reconnects: 0,
      contextState: "running",
      mutedTracks: 2,
    }),
    /Faixas sem mídia: 2/
  );
});

test("silêncio prolongado pede verificar a fonte", () => {
  const result = statusText({ connection: "translating", tracks: 1, hearing: false, silentSeconds: 10 });
  assert.equal(result.isError, true);
  assert.match(result.text, /confira a aba/);
});

test('sinal baixo e fonte do computador são apresentados sem afirmar que há voz',()=>{
 const state=statusText({connection:'translating',tracks:1,hearing:false,weakSeconds:12});assert.match(state.text,/Sinal muito baixo/);
 const diag=diagnosticText({peak:.0003,sentFrames:10,responses:0,reconnects:0,contextState:'running',captureMode:'system',signalDb:-70,sourceLabel:'Tela 1'});
 assert.match(diag,/áudio do computador/);assert.match(diag,/Tela 1/);assert.match(diag,/-70.0 dBFS/);
});

test("o diagnóstico mostra a mídia da página e a saída própria", () => {
  const text = diagnosticText({ peak: 0, sentFrames: 0, responses: 0, reconnects: 0, contextState: "running", pageMedia: 3, pagePlaying: 2, pageOtherOutput: 1 });
  assert.match(text, /Mídia na página: 3 \(tocando 2\)/);
  assert.match(text, /Saída própria: 1/);
});
