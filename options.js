const keyInput = document.getElementById("key");
const openaiKeyInput = document.getElementById("openai-key");
const providerInput = document.getElementById("answer-provider");
const contextInput = document.getElementById("context");
const promptInput = document.getElementById("interview-prompt");
const saved = document.getElementById("saved");
const defaultPrompt = globalThis.RespostasInterviewPrompt || "";

const fields = [
  [keyInput, "apiKey", "input"],
  [openaiKeyInput, "openaiKey", "input"],
  [providerInput, "answerProvider", "change"],
  [contextInput, "context", "input"],
  [promptInput, "interviewPrompt", "input"],
];
const edited = new Set();

async function saveField(element, name) {
  edited.add(name);
  try {
    const value = name === "apiKey" || name === "openaiKey" ? element.value.trim() : element.value;
    await chrome.storage.local.set({ [name]: value });
    saved.textContent = "Salvo.";
  } catch {
    saved.textContent = "Não foi possível salvar. Tente editar novamente.";
  }
}

for (const [element, name, event] of fields) {
  element.addEventListener(event, () => saveField(element, name));
}

chrome.storage.local.get(fields.map(([, name]) => name)).then(stored => {
  for (const [element, name] of fields) {
    if (edited.has(name)) continue;
    element.value = name === "interviewPrompt"
      ? (typeof stored[name] === "string" ? stored[name] : defaultPrompt)
      : name === "answerProvider" ? (stored[name] === "openai" ? "openai" : "gemini")
      : (stored[name] ?? "");
  }
});

document.getElementById("restore-prompt").addEventListener("click", () => {
  promptInput.value = defaultPrompt;
  saveField(promptInput, "interviewPrompt");
});
