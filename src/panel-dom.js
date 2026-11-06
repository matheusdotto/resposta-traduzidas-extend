// Constrói o painel sem innerHTML/TrustedHTML, inclusive em páginas com Trusted Types.
(function () {
  const template = [{"tag":"style","attrs":{},"children":["\n        * { box-sizing: border-box; }\n        [hidden] { display: none; }\n        .panel { position: fixed; top: 16px; left: 16px; z-index: 2147483647;\n          max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow-y: auto;\n          padding: 16px; border: 1px solid #1e3a5f; border-radius: 14px; background: #0b1526; color: #e2e8f0;\n          font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.5);\n          scrollbar-width: thin; scrollbar-color: #475569 transparent; --caption-height: 18vh; }\n        .panel[data-size=\"small\"] { width: 560px; --caption-height: 12vh; }\n        .panel[data-size=\"medium\"] { width: 720px; font-size: 14px; }\n        .panel[data-size=\"large\"] { width: 900px; font-size: 16px; --caption-height: 26vh; }\n        header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; cursor: move; user-select: none; touch-action: none; }\n        .logo { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px;\n          background: #2563eb; color: #fff; font-weight: 700; font-size: 13px; }\n        h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 700; }\n        .panel.minimized { width: auto; }\n        .panel.minimized header { margin-bottom: 0; }\n        .languages { display: flex; align-items: flex-end; gap: 8px; }\n        .languages label { flex: 1; font-size: 11px; font-weight: 600; color: #94a3b8; }\n        .languages span { padding-bottom: 10px; color: #64748b; }\n        select { display: block; width: 100%; margin-top: 4px; padding: 8px; border-radius: 10px;\n          background: #12233d; color: #fff; font: 600 13px system-ui, sans-serif; }\n        .my-language { border: 1px solid #2dd4bf; }\n        .their-language { border: 1px solid #fbbf24; }\n        .hint { margin: 8px 0 0; padding: 8px; border: 1px solid #854d0e; border-radius: 8px;\n          background: #292115; color: #fde68a; font-size: 12px; }\n        .hint:empty { display: none; }\n        .notice-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; }\n        .notice-row label { flex: 1; display: flex; align-items: center; gap: 6px; }\n        button { padding: 8px; border: 1px solid #334155; border-radius: 10px; cursor: pointer;\n          background: transparent; color: #93c5fd; font: 600 12px system-ui, sans-serif; }\n        button:disabled { opacity: .5; cursor: not-allowed; }\n        .toggle { display: block; width: 100%; margin-top: 10px; padding: 11px; border: 0;\n          background: #3b82f6; color: #fff; font-size: 14px; font-weight: 700; }\n        .toggle.on { background: #ef4444; }\n        .status { margin: 8px 0 0; color: #cbd5e1; }\n        .status.error { color: #fca5a5; }\n        .diag { margin: 2px 0 0; font-size: 11px; color: #64748b; }\n        .diag:empty { display: none; }\n        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }\n        .box { min-width: 0; padding: 8px; border: 1px solid #1e3a5f; border-radius: 10px; background: #0f1d33; }\n        .box.answer { border-color: #2563eb; }\n        .label { margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #94a3b8; }\n        .caption { min-height: 54px; max-height: var(--caption-height); overflow-y: auto;\n          overscroll-behavior: contain; overflow-wrap: anywhere; white-space: pre-wrap;\n          scrollbar-width: thin; scrollbar-color: #475569 transparent; }\n        .answer-status { margin: 8px 0 0; font-size: 12px; color: #94a3b8; }\n        .answer-status.error { color: #fca5a5; }\n        .actions { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 10px; }\n        .answer-now { color: #fff; border-color: #2563eb; }\n        .help-text { margin: 8px 0 0; font-size: 12px; color: #cbd5e1; }\n      "]},{"tag":"div","attrs":{"class":"panel","data-size":"medium"},"children":[{"tag":"header","attrs":{"title":"Arraste para mover"},"children":[{"tag":"span","attrs":{"class":"logo"},"children":["R"]},{"tag":"h1","attrs":{},"children":["Respostas em Reunião"]},{"tag":"button","attrs":{"class":"minimize"},"children":[]}]},{"tag":"div","attrs":{"class":"body"},"children":[{"tag":"div","attrs":{"class":"languages"},"children":[{"tag":"label","attrs":{},"children":["Eu falo",{"tag":"select","attrs":{"class":"my-language"},"children":[]}]},{"tag":"span","attrs":{},"children":["→"]},{"tag":"label","attrs":{},"children":["Eles falam",{"tag":"select","attrs":{"class":"their-language"},"children":[]}]}]},{"tag":"p","attrs":{"class":"hint language-hint"},"children":[]},{"tag":"label","attrs":{"class":"capture-source-label"},"children":["Origem do áudio",{"tag":"select","attrs":{"class":"capture-source"},"children":[{"tag":"option","attrs":{"value":"tab"},"children":["Áudio da aba (padrão)"]},{"tag":"option","attrs":{"value":"system"},"children":["Áudio do computador (alternativa)"]}]}]},{"tag":"p","attrs":{"class":"hint capture-source-hint","hidden":""},"children":["No modo computador, selecione a tela inteira com áudio do sistema. Esse modo inclui sons de outros aplicativos. As imagens não são enviadas."]},{"tag":"div","attrs":{"class":"notice-row"},"children":[{"tag":"label","attrs":{},"children":[{"tag":"input","attrs":{"type":"checkbox","class":"notice"},"children":[]}," Avisei os participantes que uso IA"]},{"tag":"button","attrs":{"class":"copy-notice"},"children":["Copiar aviso"]}]},{"tag":"p","attrs":{"class":"hint notice-hint"},"children":[]},{"tag":"button","attrs":{"class":"toggle"},"children":[]},{"tag":"p","attrs":{"class":"status"},"children":[]},{"tag":"p","attrs":{"class":"diag"},"children":[]},{"tag":"div","attrs":{"class":"grid"},"children":[{"tag":"div","attrs":{"class":"box"},"children":[{"tag":"p","attrs":{"class":"label label-original"},"children":[]},{"tag":"div","attrs":{"class":"caption original"},"children":[]}]},{"tag":"div","attrs":{"class":"box answer"},"children":[{"tag":"p","attrs":{"class":"label label-answer-theirs"},"children":[]},{"tag":"div","attrs":{"class":"caption answer-theirs"},"children":[]}]},{"tag":"div","attrs":{"class":"box"},"children":[{"tag":"p","attrs":{"class":"label label-translated"},"children":[]},{"tag":"div","attrs":{"class":"caption translated"},"children":[]}]},{"tag":"div","attrs":{"class":"box answer"},"children":[{"tag":"p","attrs":{"class":"label label-answer-mine"},"children":[]},{"tag":"div","attrs":{"class":"caption answer-mine"},"children":[]}]}]},{"tag":"div","attrs":{"class":"notice-row answer-mode-row"},"children":[{"tag":"label","attrs":{},"children":[{"tag":"input","attrs":{"type":"checkbox","class":"manual-answers"},"children":[]}," Gerar respostas só ao clicar"]}]},{"tag":"p","attrs":{"class":"answer-mode-hint","style":"margin:4px 0 0;font-size:12px;color:#94a3b8;"},"children":[]},{"tag":"p","attrs":{"class":"answer-status"},"children":[]},{"tag":"div","attrs":{"class":"actions"},"children":[{"tag":"button","attrs":{"class":"answer-now"},"children":["Responder agora"]},{"tag":"button","attrs":{"class":"clear"},"children":["Limpar"]},{"tag":"button","attrs":{"class":"size"},"children":[]},{"tag":"button","attrs":{"class":"help"},"children":["Como usar"]},{"tag":"button","attrs":{"class":"settings"},"children":["Configurações"]}]},{"tag":"p","attrs":{"class":"help-text","hidden":""},"children":[]}]}]}];
  function createPanelDom(root, languages) {
    const doc = root.ownerDocument || document;
    function node(spec) {
      if (typeof spec === 'string') return doc.createTextNode(spec);
      const element = doc.createElement(spec.tag);
      for (const [name, value] of Object.entries(spec.attrs)) element.setAttribute(name, value);
      for (const child of spec.children) element.appendChild(node(child));
      return element;
    }
    for (const spec of template) root.appendChild(node(spec));
    for (const select of root.querySelectorAll('.languages select')) {
      for (const [value, label] of Object.entries(languages)) {
        const option = doc.createElement('option'); option.value = value; option.textContent = label;
        select.appendChild(option);
      }
    }
  }
  // Move o painel pela barra de título, sem deixar que ele saia da área visível.
  function enablePanelDrag({ panel, handle, view = globalThis, onMove }) {
    let drag = null;
    let position = null;
    function place(left, top) {
      if (!Number.isFinite(left) || !Number.isFinite(top)) return;
      const box = panel.getBoundingClientRect();
      const x = Math.max(0, Math.min(left, view.innerWidth - box.width));
      const y = Math.max(0, Math.min(top, view.innerHeight - box.height));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      position = { left: x, top: y };
    }
    const keepInside = () => { if (position) place(position.left, position.top); };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest?.("button, select, input, a")) return;
      const box = panel.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top, moved: false };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (drag?.id !== event.pointerId) return;
      drag.moved = true;
      place(event.clientX - drag.x, event.clientY - drag.y);
    });
    const finish = (event) => {
      if (drag?.id !== event.pointerId) return;
      const moved = drag.moved;
      drag = null;
      if (moved) onMove?.(position);
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    view.addEventListener("resize", keepInside);
    return { place, keepInside };
  }
  const api = { createPanelDom, enablePanelDrag };
  globalThis.RespostasPanelDom = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
