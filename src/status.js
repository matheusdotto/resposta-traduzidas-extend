(function () {
  function statusText({ connection, noticeAccepted, reason, tracks, hearing, silentSeconds, weakSeconds }) {
    switch (connection) {
      case "no-key":
        return { text: "Cole a sua chave em Configurações.", isError: true };
      case "failed":
        return {
          text: `A transcrição parou. ${reason || "Verifique a chave e a conexão."}`,
          isError: true,
        };
      case "connecting":
        return { text: "Conectando.", isError: false };
      case "reconnecting":
        return { text: "Conexão perdida. Reconectando.", isError: false };
      case "translating":
        if (tracks === undefined) return { text: "Procurando o áudio da chamada.", isError: false };
        if (tracks === 0) return { text: "Nenhum áudio da chamada foi encontrado.", isError: true };
        if (silentSeconds >= 10) return { text: "Sem som na aba há 10 s ou mais. Se alguém está falando, confira a aba escolhida e o áudio da reunião.", isError: true };
        if (weakSeconds >= 10) return { text: "Sinal muito baixo ou pausa. Se a pessoa fala, confira a fonte capturada e a saída de áudio da reunião.", isError: false };
        if (!hearing) {
          return { text: `Aguardando alguém falar (${tracks} áudios da chamada).`, isError: false };
        }
        return { text: "Ouvindo a conversa.", isError: false };
      default:
        return noticeAccepted
          ? { text: "Pronta para ligar.", isError: false }
          : { text: "Marque o aviso para poder ligar.", isError: false };
    }
  }

  function answerStatusText({ state, reason }) {
    if (state === "retrying") return { text: reason || "Gemini ocupado. Tentando novamente.", isError: false };
    if (state === "generating") return { text: "Gerando a resposta.", isError: false };
    if (state === "failed") {
      return { text: `A resposta falhou. ${reason || ""}`.trim(), isError: true };
    }
    return { text: "Rascunho da IA: revise antes de usar.", isError: false };
  }

  function diagnosticText({ peak, sentFrames, responses, reconnects, contextState, mutedTracks, captureMode, signalDb, sourceLabel, pageMedia, pagePlaying, pageOtherOutput }) {
    if (peak === undefined) return "";
    const parts = [
      `Pico de som: ${peak.toFixed(4).replace(".", ",")}`,
      `Enviado: ${Math.round(sentFrames / 10)} s`,
      `Respostas: ${responses}`,
      `Reconexões: ${reconnects}`,
      `Áudio: ${contextState}`,
    ];
    if (captureMode === "tab") parts.push("Fonte: áudio da aba");
    if (captureMode === "system") parts.push("Fonte: áudio do computador");
    if (signalDb !== undefined) parts.push(`Nível: ${signalDb === null ? "silêncio" : signalDb.toFixed(1) + " dBFS"}`);
    if (sourceLabel) parts.push(`Capturando: ${sourceLabel}`);
    if (mutedTracks !== undefined) parts.push(`Faixas sem mídia: ${mutedTracks}`);
    if (pageMedia !== undefined) parts.push(`Mídia na página: ${pageMedia} (tocando ${pagePlaying})`);
    if (pageOtherOutput) parts.push(`Saída própria: ${pageOtherOutput}`);
    return parts.join(" · ");
  }

  const api = { statusText, answerStatusText, diagnosticText };
  globalThis.RespostasStatus = api;
  if (typeof module !== "undefined") module.exports = api;
})();
