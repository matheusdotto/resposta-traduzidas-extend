(function () {
  const TARGET_RATE = 16000;

  function downsampleTo16k(input, inputRate) {
    const ratio = inputRate / TARGET_RATE;
    const output = new Int16Array(Math.round(input.length / ratio));
    for (let i = 0; i < output.length; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j] || 0;
      const sample = Math.max(-1, Math.min(1, sum / (end - start)));
      output[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    return output;
  }

  // Guarda a posição entre os blocos: a conversão não recomeça em cada um deles.
  function createDownsampler(inputRate) {
    const ratio = inputRate / TARGET_RATE;
    let consumed = 0;
    let produced = 0;
    let sum = 0;
    let count = 0;
    return {
      push(input) {
        const output = [];
        for (let i = 0; i < input.length; i++) {
          sum += input[i];
          count++;
          consumed++;
          if (consumed < Math.floor((produced + 1) * ratio)) continue;
          const sample = Math.max(-1, Math.min(1, sum / count));
          sum = 0;
          count = 0;
          while (consumed >= Math.floor((produced + 1) * ratio)) {
            output.push(sample < 0 ? sample * 32768 : sample * 32767);
            produced++;
          }
        }
        return Int16Array.from(output);
      },
    };
  }

  function createChunker(size = 1600) {
    let pending = new Int16Array(0);
    return {
      push(samples) {
        const joined = new Int16Array(pending.length + samples.length);
        joined.set(pending);
        joined.set(samples, pending.length);
        const blocks = [];
        let offset = 0;
        while (joined.length - offset >= size) {
          blocks.push(joined.slice(offset, offset + size));
          offset += size;
        }
        pending = joined.slice(offset);
        return blocks;
      },
    };
  }

  function int16ToBase64(samples) {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    samples.forEach((sample, i) => view.setInt16(i * 2, sample, true));
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToFloat32(b64) {
    const binary = atob(b64);
    const view = new DataView(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
    const output = new Float32Array(Math.floor(binary.length / 2));
    for (let i = 0; i < output.length; i++) output[i] = view.getInt16(i * 2, true) / 32768;
    return output;
  }

  function rms(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      const sample = frame[i] / 32768;
      sum += sample * sample;
    }
    return Math.sqrt(sum / (frame.length || 1));
  }

  function createSpeechGate({
    threshold = 0.005,
    hangoverFrames = 50,
    prerollFrames = 3,
    minSpeechFrames = 2,
  } = {}) {
    let preroll = [];
    let speaking = false;
    let silentFrames = 0;
    let speechRun = 0;
    let noiseFloor = 0;
    return {
      push(frame) {
        const level = rms(frame);
        const hasSpeech = level >= Math.max(threshold, noiseFloor * 3);
        // O piso sobe devagar durante som contínuo e acompanha o ambiente nas pausas.
        noiseFloor = hasSpeech
          ? Math.max(noiseFloor, threshold / 3) * 1.02
          : noiseFloor * 0.9 + level * 0.1;
        if (!speaking) {
          // Cliques de teclado duram um bloco; a fala se sustenta por mais tempo.
          preroll.push(frame);
          speechRun = hasSpeech ? speechRun + 1 : 0;
          if (speechRun < minSpeechFrames) {
            while (preroll.length > prerollFrames + speechRun) preroll.shift();
            return { send: [], ended: false, hasSpeech };
          }
          const send = preroll;
          preroll = [];
          speaking = true;
          silentFrames = 0;
          speechRun = 0;
          return { send, ended: false, hasSpeech };
        }
        if (hasSpeech) {
          silentFrames = 0;
          return { send: [frame], ended: false, hasSpeech };
        }
        silentFrames++;
        if (silentFrames < hangoverFrames) return { send: [frame], ended: false, hasSpeech };
        speaking = false;
        return { send: [frame], ended: true, hasSpeech };
      },
    };
  }

  // A folga absorve a variação de chegada dos trechos, que causaria cortes na voz.
  function nextPlayTime(now, nextStart, lead) {
    return nextStart > now ? nextStart : now + lead;
  }

  function withVoiceProcessing(constraints, filtersOn = true) {
    if (!constraints?.audio) return constraints;
    const audio = typeof constraints.audio === "object" ? constraints.audio : {};
    return {
      ...constraints,
      audio: {
        ...audio,
        noiseSuppression: filtersOn,
        echoCancellation: true,
        autoGainControl: filtersOn,
      },
    };
  }

  const api = {
    downsampleTo16k,
    createDownsampler,
    createChunker,
    int16ToBase64,
    base64ToFloat32,
    createSpeechGate,
    nextPlayTime,
    withVoiceProcessing,
  };
  globalThis.VozAudio = api;
  if (typeof module !== "undefined") module.exports = api;
})();
