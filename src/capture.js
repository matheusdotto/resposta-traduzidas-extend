// Roda no mundo isolado. Captura a aba escolhida ou, se selecionado, o áudio do computador.
(function () {
  // Só para diagnóstico: mostra como a página toca o som, sem ler o áudio.
  function inspectPageAudio(doc = globalThis.document) {
    if (!doc?.querySelectorAll) return null;
    const media = Array.from(doc.querySelectorAll("audio, video"));
    return {
      pageMedia: media.length,
      pagePlaying: media.filter((item) => !item.paused && (item.srcObject || item.currentSrc)).length,
      pageOtherOutput: media.filter((item) => item.sinkId && item.sinkId !== "default").length,
    };
  }

  function createTabCapture({
    onAudio, onState, onError,
    mediaDevices = navigator.mediaDevices,
    AudioContextImpl = globalThis.AudioContext,
    audioUtils = globalThis.VozAudio,
    schedule = setInterval, cancel = clearInterval,
  }) {
    let current = null;
    let generation = 0;
    const releaseStream = (stream) => stream.getTracks().forEach((track) => track.stop());

    function stop() {
      generation++;
      const entry = current;
      current = null;
      if (!entry) return;
      if (entry.timer !== undefined) cancel(entry.timer);
      if (entry.processor) entry.processor.onaudioprocess = null;
      entry.source?.disconnect();
      entry.processor?.disconnect();
      entry.sink?.disconnect();
      releaseStream(entry.stream);
      entry.context?.close().catch(() => {});
    }

    // Esta chamada deve acontecer diretamente no clique, antes de qualquer await.
    async function start({ mode = "tab" } = {}) {
      mode = mode === "system" ? "system" : "tab";
      stop();
      const token = generation;
      let stream;
      try {
        stream = await mediaDevices.getDisplayMedia({
          video: true,
          audio: { suppressLocalAudioPlayback: false },
          preferCurrentTab: mode === "tab",
          selfBrowserSurface: "include",
          systemAudio: mode === "system" ? "include" : "exclude",
          surfaceSwitching: "exclude",
        });
        if (token !== generation) { releaseStream(stream); return false; }
        const tracks = stream.getAudioTracks();
        if (!tracks.length) {
          throw new Error(mode === 'system' ? 'Nenhum áudio foi compartilhado. Escolha a tela inteira com Compartilhar áudio do sistema.' : 'Nenhum áudio foi compartilhado. Escolha a aba da reunião e marque "Compartilhar áudio da aba".');
        }
        const surface = stream.getVideoTracks()[0]?.getSettings?.().displaySurface;
        if (surface && ((mode === "tab" && surface !== "browser") || (mode === "system" && surface !== "monitor"))) {
          throw new Error(mode === "tab" ? "Escolha uma aba do navegador, em vez de uma janela ou tela inteira." : "Escolha a tela inteira e habilite Compartilhar áudio do sistema.");
        }
        const entry = current = { stream, context: new AudioContextImpl({ latencyHint: "interactive" }), totalFrames: 0, peak: 0, hearing: false, silentSeconds: 0, weakSeconds: 0, sumSquares: 0, sampleCount: 0 };
        const { createDownsampler, createChunker, int16ToBase64 } = audioUtils;
        const downsampler = createDownsampler(entry.context.sampleRate);
        const chunker = createChunker();
        const sourceLabel = String(stream.getVideoTracks()[0]?.label || tracks[0]?.label || "Fonte sem identificação").slice(0, 180);
        entry.source = entry.context.createMediaStreamSource(new MediaStream(tracks));
        entry.processor = entry.context.createScriptProcessor(4096, 1, 1);
        entry.sink = entry.context.createGain();
        entry.sink.gain.value = 0;
        entry.source.connect(entry.processor).connect(entry.sink).connect(entry.context.destination);
        entry.processor.onaudioprocess = (event) => {
          if (current !== entry) return;
          const input = event.inputBuffer.getChannelData(0);
          for (const sample of input) {
            entry.peak = Math.max(entry.peak, Math.abs(sample));
            entry.sumSquares += sample * sample; entry.sampleCount++;
          }
          for (const block of chunker.push(downsampler.push(input))) {
            let sum = 0;
            for (const value of block) sum += (value / 32768) ** 2;
            const hasSpeech = Math.sqrt(sum / block.length) >= 0.005;
            entry.hearing ||= hasSpeech;
            // Não descartar voz baixa: todo bloco PCM segue para o serviço.
            entry.totalFrames++;
            onAudio(int16ToBase64(block), hasSpeech);
          }
        };
        const ended = () => {
          if (current !== entry) return;
          stop();
          onError("O compartilhamento de áudio foi encerrado. Clique em Ligar para selecionar a aba novamente.");
        };
        // Mantemos a faixa de vídeo viva, mas nunca lemos nem enviamos suas imagens.
        stream.getTracks().forEach((track) => track.addEventListener("ended", ended, { once: true }));
        const report = () => {
          if (current !== entry) return;
          entry.silentSeconds = entry.peak < 0.0001 ? entry.silentSeconds + 1 : 0;
          entry.weakSeconds = entry.peak < 0.003 ? entry.weakSeconds + 1 : 0;
          const rms = Math.sqrt(entry.sumSquares / Math.max(1, entry.sampleCount));
          onState({ tracks: tracks.length, mutedTracks: tracks.filter((t) => t.muted).length,
            hearing: entry.hearing, peak: entry.peak, sentFrames: entry.totalFrames,
            contextState: entry.context.state, silentSeconds: entry.silentSeconds, weakSeconds: entry.weakSeconds,
            rms, signalDb: rms > 0 ? 20 * Math.log10(rms) : null, sourceLabel, captureMode: mode, ...inspectPageAudio() });
          entry.sumSquares = 0; entry.sampleCount = 0;
          entry.peak = 0;
          entry.hearing = false;
        };
        await entry.context.resume();
        if (token !== generation) return false;
        entry.timer = schedule(report, 1000);
        report();
        return true;
      } catch (error) {
        if (token !== generation) { if (stream) releaseStream(stream); return false; }
        if (current) stop();
        else if (stream) releaseStream(stream);
        if (error.name === "NotAllowedError") throw new Error("Captura cancelada ou sem permissão. Clique em Ligar e autorize o áudio da origem selecionada.");
        if (error.name === "InvalidStateError") throw new Error("Clique novamente em Ligar com a aba da reunião em foco para autorizar a captura.");
        throw error;
      }
    }
    return { start, stop };
  }
  const api = { createTabCapture, inspectPageAudio };
  globalThis.RespostasCapture = api;
  if (typeof module !== "undefined") module.exports = api;
})();
