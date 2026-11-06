// Interface na aba da reunião; chave e sessão no mundo isolado da extensão.
(function () {
  if (globalThis.__respostasPanelController) { globalThis.__respostasPanelController.show(); return; }
  const MAX_CAPTION = 20000;
  const MAX_RECENT = 3000;
  const MIN_NEW_SPEECH = 3;
  const STICK_TO_BOTTOM_PX = 8;
  const ACTIVE = new Set(["connecting", "translating", "reconnecting"]);
  const SIZES = [
    { id: "small", label: "Pequeno" },
    { id: "medium", label: "Médio" },
    { id: "large", label: "Grande" },
  ];
  const NOTICE_TEXT =
    "Aviso: estou usando uma extensão de IA nesta reunião para transcrever e traduzir a conversa e sugerir respostas. O áudio é processado pelo Google. Para sugerir respostas, trechos da transcrição e o contexto são enviados ao provedor configurado (Google ou OpenAI).";
  const HELP_TEXT =
    "Avise os participantes, marque a caixa e clique em Ligar. No seletor de captura de áudio, escolha a aba da reunião e marque Compartilhar áudio da aba. Não escolha a tela inteira. A fala dos outros aparece nas caixas da esquerda. Quando alguém termina uma pergunta, a resposta sugerida aparece à direita. Marque Gerar respostas só ao clicar para desativar sugestões automáticas; transcrição e tradução continuam. Use Responder agora para pedir a sugestão. As respostas são rascunhos da IA e podem estar erradas.";

  const { LANGUAGE_NAMES, createAnswerClient, createPauseTrigger, splitAnswer } =
    globalThis.RespostasAnswers;
  const { statusText, answerStatusText, diagnosticText } = globalThis.RespostasStatus;

  const state = {
    connection: "off",
    noticeAccepted: false,
    reason: "",
    responses: 0,
    reconnects: 0,
    answerState: "idle",
    answerReason: "",
  };
  const settings = { myLanguage: "pt-BR", theirLanguage: "en", context: "", captureSource: "tab", manualAnswers: false };
  let panelSize = "medium";
  let panelMinimized = false;
  let committedAnswer = { theirs: "", mine: "" };
  let inFlight = null;
  let failedRequest = null;
  let recent = "";
  let newSpeech = "";
  let answers = null;
  let ui = null;
  let panelHost = null;
  let startAttempt = 0;

  const isActive = () => ACTIVE.has(state.connection);

  const manager = globalThis.VozSessionManager.createSessionManager({
    createSession: globalThis.VozGemini.createSession,
    onEvent: handleSessionEvent,
  });
  const trigger = createPauseTrigger({ onPause: () => requestAnswer(false) });

  function setConnection(connection, reason = "") {
    state.connection = connection;
    state.reason = reason;
    render();
  }

  function handleSessionEvent(event) {
    if (["inputText", "outputText", "audio"].includes(event.type)) state.responses++;
    if (event.type === "ready") {
      setConnection("translating");
    } else if (event.type === "inputText") {
      appendCaption("original", event.text);
      recent = (recent + event.text).slice(-MAX_RECENT);
      newSpeech += event.text;
      if (!settings.manualAnswers) trigger.noteSpeech();
      render();
    } else if (event.type === "outputText") {
      appendCaption("translated", event.text);
      render();
    } else if (event.type === "reconnecting") {
      state.reconnects++;
      setConnection("reconnecting");
    } else if (event.type === "failed") {
      recorder.stop();
      trigger.stop();
      answers?.cancel();
      restoreCommittedAnswer();
      state.answerState = "idle";
      setConnection("failed", event.reason);
    }
  }

  function setAnswerState(answerState, answerReason = "") {
    state.answerState = answerState;
    state.answerReason = answerReason;
    render();
  }

  function restoreCommittedAnswer() {
    setCaption("answerTheirs", committedAnswer.theirs);
    setCaption("answerMine", committedAnswer.mine);
  }

  function finishAnswer(text) {
    const completedRequest = inFlight?.request;
    inFlight = null;
    const { noQuestion, theirs, mine } = splitAnswer(text);
    if (!noQuestion && theirs && mine) {
      committedAnswer = { theirs, mine };
      setAnswerState("idle");
      return;
    }
    failedRequest = noQuestion ? null : completedRequest;
    restoreCommittedAnswer();
    if (noQuestion) setAnswerState("idle");
    else if (theirs) setAnswerState("failed", "A resposta veio incompleta.");
    else setAnswerState("failed", "A resposta veio em um formato inesperado.");
  }

  function requestAnswer(force) {
    if (!answers || (!force && settings.manualAnswers)) return;
    const fresh = newSpeech.trim();
    if (force && !fresh && failedRequest) { generateAnswer({ ...failedRequest, force: true }); return; }
    if (!force && fresh.length < MIN_NEW_SPEECH) return;
    // A fala nova é o alvo; perguntas anteriores ficam apenas no contexto.
    const latest =
      fresh || inFlight?.latest || failedRequest?.latest || (force ? recent.slice(-500).trim() : "");
    if (latest.length < MIN_NEW_SPEECH) return;
    const useForce = force || Boolean(inFlight?.force);
    const before = recent.slice(0, Math.max(0, recent.length - newSpeech.length));
    newSpeech = "";
    trigger.stop();
    generateAnswer({ recent: before, latest, context: settings.context,
      theirLanguage: settings.theirLanguage, myLanguage: settings.myLanguage, force: useForce });
  }

  function setManualAnswers(value, persist = true) {
    settings.manualAnswers = value === true;
    trigger.stop();
    if (settings.manualAnswers && inFlight) {
      const pending = inFlight.request;
      answers?.cancel();
      inFlight = null;
      if (pending?.latest) newSpeech = [pending.latest, newSpeech.trim()].filter(Boolean).join(" ");
      failedRequest = null;
      restoreCommittedAnswer();
      setAnswerState("idle");
    } else if (!settings.manualAnswers && newSpeech.trim() && isActive()) {
      trigger.noteSpeech();
    }
    if (persist) chrome.storage.local.set({ manualAnswers: settings.manualAnswers });
    render();
  }

  function generateAnswer(request) {
    failedRequest = null;
    inFlight = { latest: request.latest, force: request.force, request };
    setAnswerState("generating");
    answers.generate(request,
      {
        onRetry: ({ attempt, maxRetries, delayMs }) => {
          restoreCommittedAnswer();
          setAnswerState("retrying", `Provedor ocupado. Tentativa ${attempt}/${maxRetries} em ${(delayMs / 1000).toFixed(1)} s.`);
        },
        onText: (text) => {
          if (state.answerState !== "generating") setAnswerState("generating");
          const { noQuestion, theirs, mine } = splitAnswer(text);
          if (noQuestion || !theirs) return;
          setCaption("answerTheirs", theirs);
          setCaption("answerMine", mine);
        },
        onDone: finishAnswer,
        onError: (reason) => {
          failedRequest = inFlight?.request;
          inFlight = null;
          restoreCommittedAnswer();
          setAnswerState("failed", reason);
        },
      }
    );
  }

  const recorder = globalThis.RespostasCapture.createTabCapture({
    onAudio: (data, hasSpeech) => {
      if (state.connection === "translating" || state.connection === "reconnecting") manager.sendAudio(data, hasSpeech);
      // A pausa é da voz recebida, não do atraso de entrega da transcrição.
      if (!settings.manualAnswers && hasSpeech && newSpeech.trim()) trigger.noteSpeech();
    },
    onState: (details) => { Object.assign(state, details); render(); },
    onError: (reason) => { stop(); setConnection("failed", reason); },
  });

  async function start() {
    const attempt = ++startAttempt;
    setConnection("connecting");
    state.peak = undefined;
    state.tracks = undefined;
    state.hearing = false;
    state.silentSeconds = 0;
    state.weakSeconds = 0;
    state.sourceLabel = "";
    // Abrir o seletor antes de aguardar storage ou Gemini preserva o gesto do clique.
    try {
      const [captured, stored] = await Promise.all([
        recorder.start({ mode: settings.captureSource }), chrome.storage.local.get(["apiKey", "context", "answerProvider", "openaiKey"]),
      ]);
      if (attempt !== startAttempt || !captured) return;
      if (!stored.apiKey) { recorder.stop(); setConnection("no-key"); return; }
      const provider = stored.answerProvider === "openai" ? "openai" : "gemini";
      if (provider === "openai" && !stored.openaiKey?.trim()) {
        recorder.stop();
        setConnection("failed", "Adicione a chave da OpenAI em Configurações ou selecione Gemini para as respostas.");
        return;
      }
      settings.context = stored.context ?? "";
      state.responses = 0;
      state.reconnects = 0;
      answers = createAnswerClient({ apiKey: stored.apiKey, provider });
      manager.start({ apiKey: stored.apiKey, targetLanguageCode: settings.myLanguage });
    } catch (error) {
      if (attempt !== startAttempt) return;
      recorder.stop();
      setConnection("failed", error.message || "Não foi possível capturar o áudio da aba.");
    }
  }

  function stop() {
    startAttempt++;
    manager.stop();
    trigger.stop();
    answers?.cancel();
    answers = null;
    inFlight = null;
    failedRequest = null;
    restoreCommittedAnswer();
    newSpeech = "";
    recorder.stop();
    state.answerState = "idle";
    setConnection("off");
  }


  function appendCaption(kind, text) {
    if (!ui) return;
    setCaption(kind, (ui[kind].textContent + text).slice(-MAX_CAPTION));
  }

  function setCaption(kind, text) {
    if (!ui) return;
    const element = ui[kind];
    // Só acompanha o texto novo se a pessoa não subiu para reler.
    const atBottom =
      element.scrollTop + element.clientHeight >= element.scrollHeight - STICK_TO_BOTTOM_PX;
    element.textContent = text;
    if (atBottom) element.scrollTop = element.scrollHeight;
  }

  function clearCaptions() {
    for (const kind of ["original", "translated", "answerTheirs", "answerMine"]) {
      ui[kind].textContent = "";
    }
    recent = "";
    newSpeech = "";
    committedAnswer = { theirs: "", mine: "" };
    inFlight = null;
    failedRequest = null;
    answers?.cancel();
    setAnswerState("idle");
  }

  function applyMinimized(minimized) {
    panelMinimized = minimized;
    ui.body.hidden = minimized;
    ui.panel.classList.toggle("minimized", minimized);
    ui.minimize.textContent = minimized ? "Expandir" : "Minimizar";
    ui.drag.keepInside();
  }

  function applyPanelSize(id) {
    const size = SIZES.find((candidate) => candidate.id === id);
    if (!size) return;
    panelSize = id;
    ui.panel.dataset.size = id;
    ui.size.textContent = `Tamanho: ${size.label}`;
    ui.drag.keepInside();
  }

  function cyclePanelSize() {
    const index = SIZES.findIndex((size) => size.id === panelSize);
    const next = SIZES[(index + 1) % SIZES.length].id;
    applyPanelSize(next);
    chrome.storage.local.set({ panelSize: next });
  }

  function saveLanguages() {
    settings.myLanguage = ui.myLanguage.value;
    settings.theirLanguage = ui.theirLanguage.value;
    chrome.storage.local.set({
      myLanguage: settings.myLanguage,
      theirLanguage: settings.theirLanguage,
    });
    render();
  }

  async function copyNotice() {
    try {
      await navigator.clipboard.writeText(NOTICE_TEXT);
      ui.noticeHint.textContent = "Aviso copiado. Cole no chat da reunião.";
    } catch {
      ui.noticeHint.textContent = NOTICE_TEXT;
    }
  }

  function render() {
    if (!ui) return;
    const main = statusText(state);
    ui.status.textContent = main.text;
    ui.status.classList.toggle("error", main.isError);
    ui.diag.textContent = diagnosticText(state);

    const answer = answerStatusText({ state: state.answerState, reason: state.answerReason });
    ui.answerStatus.textContent = answer.text;
    ui.answerStatus.classList.toggle("error", answer.isError);

    const active = isActive();
    ui.toggle.textContent = active ? "Desligar" : "Ligar";
    ui.toggle.classList.toggle("on", active);
    ui.toggle.disabled = !active && !state.noticeAccepted;
    ui.notice.disabled = active;
    ui.myLanguage.disabled = active;
    ui.theirLanguage.disabled = active;
    ui.captureSource.disabled = active;
    ui.captureSourceHint.hidden = settings.captureSource !== "system";
    ui.answerNow.disabled = !active;
    ui.manualAnswers.checked = settings.manualAnswers;
    ui.answerModeHint.textContent = settings.manualAnswers
      ? "Modo manual: transcrição e tradução continuam. Clique em Responder agora para gerar a sugestão."
      : "Modo automático: a sugestão é gerada após uma pausa na fala.";

    const theirs = LANGUAGE_NAMES[settings.theirLanguage];
    const mine = LANGUAGE_NAMES[settings.myLanguage];
    ui.labelOriginal.textContent = `Eles falaram (${theirs})`;
    ui.labelTranslated.textContent = `Tradução (${mine})`;
    ui.labelAnswerTheirs.textContent = `Resposta (${theirs})`;
    ui.labelAnswerMine.textContent = `Resposta (${mine})`;
    ui.languageHint.textContent =
      settings.myLanguage === settings.theirLanguage
        ? "Os dois estão no mesmo idioma: escolha em Eles falam o idioma dos outros."
        : "";
  }

  function mountPanel() {
    if (!panelHost || !document.documentElement) return;
    const target = document.fullscreenElement || document.documentElement;
    if (panelHost.parentNode !== target) target.appendChild(panelHost);
  }

  function showPanel() {
    if (!ui) createPanel();
    mountPanel();
    if (ui) applyMinimized(false);
  }

  function createPanel() {
    if (ui) { mountPanel(); return; }
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    globalThis.RespostasPanelDom.createPanelDom(root, LANGUAGE_NAMES);
    const q = (selector) => root.querySelector(selector);
    ui = {
      panel: q(".panel"),
      captureSource: q(".capture-source"),
      captureSourceHint: q(".capture-source-hint"),
      body: q(".body"),
      minimize: q(".minimize"),
      myLanguage: q(".my-language"),
      theirLanguage: q(".their-language"),
      languageHint: q(".language-hint"),
      notice: q(".notice"),
      noticeHint: q(".notice-hint"),
      toggle: q(".toggle"),
      status: q(".status"),
      diag: q(".diag"),
      original: q(".original"),
      translated: q(".translated"),
      answerTheirs: q(".answer-theirs"),
      answerMine: q(".answer-mine"),
      labelOriginal: q(".label-original"),
      labelTranslated: q(".label-translated"),
      labelAnswerTheirs: q(".label-answer-theirs"),
      labelAnswerMine: q(".label-answer-mine"),
      answerStatus: q(".answer-status"),
      answerNow: q(".answer-now"),
      manualAnswers: q(".manual-answers"),
      answerModeHint: q(".answer-mode-hint"),
      size: q(".size"),
    };
    ui.drag = globalThis.RespostasPanelDom.enablePanelDrag({
      panel: ui.panel, handle: q("header"), view: window,
      onMove: (panelPosition) => chrome.storage.local.set({ panelPosition }),
    });
    ui.notice.addEventListener("change", () => {
      state.noticeAccepted = ui.notice.checked;
      render();
    });
    ui.toggle.addEventListener("click", () => (isActive() ? stop() : start()));
    ui.answerNow.addEventListener("click", () => requestAnswer(true));
    ui.manualAnswers.addEventListener("change", () => setManualAnswers(ui.manualAnswers.checked));
    ui.size.addEventListener("click", cyclePanelSize);
    ui.minimize.addEventListener("click", () => {
      applyMinimized(!panelMinimized);
      chrome.storage.local.set({ panelMinimized });
    });
    ui.captureSource.addEventListener("change", () => {
      settings.captureSource = ui.captureSource.value === "system" ? "system" : "tab";
      chrome.storage.local.set({ captureSource: settings.captureSource });
      render();
    });
    ui.myLanguage.addEventListener("change", saveLanguages);
    ui.theirLanguage.addEventListener("change", saveLanguages);
    q(".copy-notice").addEventListener("click", copyNotice);
    q(".clear").addEventListener("click", clearCaptions);
    q(".settings").addEventListener("click", () => chrome.runtime.sendMessage({ type: "open-options" }));
    q(".help").addEventListener("click", () => {
      const help = q(".help-text");
      help.textContent = HELP_TEXT;
      help.hidden = !help.hidden;
    });
    ui.captureSource.value = settings.captureSource;
    ui.myLanguage.value = settings.myLanguage;
    ui.theirLanguage.value = settings.theirLanguage;
    applyPanelSize(panelSize);
    applyMinimized(false);
    chrome.storage.local.get(["panelSize", "panelMinimized", "panelPosition", "myLanguage", "theirLanguage", "captureSource", "manualAnswers"]).then((stored) => {
      applyPanelSize(stored.panelSize);
      applyMinimized(stored.panelMinimized === true);
      ui.drag.place(stored.panelPosition?.left, stored.panelPosition?.top);
      setManualAnswers(stored.manualAnswers === true, false);
      settings.captureSource = stored.captureSource === "system" ? "system" : "tab";
      ui.captureSource.value = settings.captureSource;
      settings.myLanguage = stored.myLanguage ?? settings.myLanguage;
      settings.theirLanguage = stored.theirLanguage ?? settings.theirLanguage;
      ui.myLanguage.value = settings.myLanguage;
      ui.theirLanguage.value = settings.theirLanguage;
      render();
    });
    render();
    panelHost = host;
    mountPanel();
    const observer = new MutationObserver(() => { if (!panelHost.isConnected) mountPanel(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("fullscreenchange", mountPanel);
    window.addEventListener("pagehide", () => observer.disconnect());
    window.addEventListener("pageshow", () => { observer.observe(document.documentElement, { childList: true, subtree: true }); mountPanel(); });
  }

  globalThis.__respostasPanelController = { show: showPanel };
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "show-panel") return;
    showPanel(); sendResponse({ ok: true });
  });
  window.addEventListener("pagehide", stop, { once: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPanel, { once: true });
  } else {
    createPanel();
  }
})();
