(function () {
  function supportedUrl(value) {
    try {
      const url = new URL(value);
      const zoom = (url.hostname === 'zoom.us' || url.hostname.endsWith('.zoom.us')) && url.pathname.startsWith('/wc/');
      return url.protocol === 'https:' && (zoom || url.hostname === 'meet.google.com' ||
        ['teams.microsoft.com','teams.live.com','teams.cloud.microsoft'].some(host => url.hostname === host || url.hostname.endsWith('.'+host)));
    } catch { return false; }
  }
  function createPanelActions(api) {
    return {
      async click(tab) {
        if (!supportedUrl(tab?.url) || !Number.isInteger(tab.id)) { await api.runtime.openOptionsPage(); return; }
        try {
          let shown;
          try { shown = await api.tabs.sendMessage(tab.id, {type:'show-panel'}, {frameId:0}); } catch {}
          if (!shown?.ok) {
            const files = api.runtime.getManifest().content_scripts[0].js;
            await api.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},files});
            shown = await api.tabs.sendMessage(tab.id, {type:'show-panel'}, {frameId:0});
          }
          if (!shown?.ok) throw Error('O painel não respondeu. Recarregue a aba da reunião.');
          await api.action.setBadgeText({tabId:tab.id,text:''});
        } catch(error) {
          await api.action.setBadgeText({tabId:tab.id,text:'!'});
          await api.action.setTitle({tabId:tab.id,title:'Falha ao mostrar painel: '+error.message});
          console.error('Respostas em Reunião:',error.message);
        }
      },
    };
  }
  function handleOpenAIAnswer(port, storage, fetchImpl = fetch) {
    const controller = new AbortController();
    let started = false;
    let key = "";
    const send = message => { if (!controller.signal.aborted) port.postMessage(message); };
    port.onDisconnect.addListener(() => controller.abort());
    port.onMessage.addListener(async ({ instructions, input } = {}) => {
      if (started || controller.signal.aborted) return;
      started = true;
      const timeout = setTimeout(() => {
        send({ error: "A OpenAI excedeu o tempo limite de resposta.", code: 408 });
        controller.abort();
      }, 90000);
      try {
        if (typeof instructions !== "string" || typeof input !== "string" || instructions.length + input.length > 150000) {
          send({ error: "Pedido de resposta inválido." });
          return;
        }
        const stored = await storage.get("openaiKey");
        key = stored.openaiKey?.trim() || "";
        if (!key) { send({ error: "Adicione a chave da OpenAI em Configurações." }); return; }
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST", redirect: "error", credentials: "omit",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body: JSON.stringify({ model: "gpt-4.1-mini", instructions, input, stream: true, store: false, max_output_tokens: 2400 }),
          signal: controller.signal,
        });
        const redact = value => String(value).split(key).join("***");
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const wait = response.headers.get("retry-after");
          const retryAfterMs = wait && /^\d+(?:\.\d+)?$/.test(wait) ? Number(wait) * 1000 : 0;
          send({ error: redact(payload?.error?.message || "Erro HTTP " + response.status), code: response.status, status: payload?.error?.code, retryAfterMs });
          return;
        }
        const decoder = new TextDecoder();
        let pending = "";
        for await (const bytes of response.body) {
          pending += decoder.decode(bytes, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            const event = JSON.parse(data);
            if (event.type === "response.output_text.delta") send({ text: event.delta });
            if (event.type === "response.completed") { send({ done: true }); return; }
            if (["response.failed", "response.incomplete", "error"].includes(event.type)) {
              send({ error: redact(event.response?.error?.message || event.message || "A OpenAI não completou a resposta.") });
              return;
            }
          }
        }
        send({ error: "A transmissão da OpenAI terminou antes da resposta completa.", code: 503 });
      } catch {
        send({ error: "Falha na conexão com a OpenAI.", code: 503 });
      } finally {
        clearTimeout(timeout);
      }
    });
  }
  if (typeof module !== 'undefined') module.exports = { supportedUrl, createPanelActions, handleOpenAIAnswer };
  if (typeof chrome === 'undefined') return;
  const actions = createPanelActions(chrome);
  chrome.runtime.onConnect.addListener(port => {
    if (port.name === "openai-answer" && port.sender?.id === chrome.runtime.id && supportedUrl(port.sender.url)) {
      handleOpenAIAnswer(port, chrome.storage.local);
    }
  });
  chrome.action.onClicked.addListener(tab => actions.click(tab));
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'open-options') chrome.runtime.openOptionsPage();
  });
})();
