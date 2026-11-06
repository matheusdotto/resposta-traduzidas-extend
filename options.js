const openaiKeyInput = document.getElementById("openai-key");
const providerInput = document.getElementById("answer-provider");
const keyInput = document.getElementById("key");
const contextInput = document.getElementById("context");
const saved = document.getElementById("saved");

chrome.storage.local.get(["apiKey", "context", "openaiKey", "answerProvider"]).then(({ apiKey, context, openaiKey, answerProvider }) => {
  openaiKeyInput.value = openaiKey ?? "";
  providerInput.value = answerProvider === "openai" ? "openai" : "gemini";
  keyInput.value = apiKey ?? "";
  contextInput.value = context ?? "";
});

async function save() {
  await chrome.storage.local.set({
    openaiKey: openaiKeyInput.value.trim(),
    answerProvider: providerInput.value,
    apiKey: keyInput.value.trim(),
    context: contextInput.value.trim(),
  });
  saved.textContent = "Salvo.";
}

keyInput.addEventListener("input", save);
contextInput.addEventListener("input", save);

// Apenas visualização: não sobrescreve a chave nem o contexto adicional salvo.
document.getElementById("interview-prompt").value = globalThis.RespostasInterviewPrompt || "Contexto de entrevista indisponível. Recarregue a extensão.";

openaiKeyInput.addEventListener("input", save);
providerInput.addEventListener("change", save);
