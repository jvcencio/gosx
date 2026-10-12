// Scene input adapter: content remains server-rendered; the scene owns picking
// and camera controls. The handheld is a separate, lazily loaded WASM runtime.
(function () {
  "use strict";
  function mount() {
    const root = document.querySelector(".bgb");
    if (!root || root.dataset.discoveryMounted) return;
    root.dataset.discoveryMounted = "true";
    const journal = root.querySelector(".bgb__journal");
    const dialog = root.querySelector(".bgb__handheld-dialog");
    const status = root.querySelector("[data-coast-status]");
    const pocket = root.querySelector("[data-coast-pocket]");
    const keys = ["tide-pool-0", "tide-pool-1", "tide-pool-2", "shore-handheld"];
    const found = new Set();
    let frame = null, previousFocus = null, resumeCoast = false, pickupApplied = false;
    const storageKey = "gosx.blackglass.field-journal.v1";
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) for (const id of saved) if (keys.includes(id)) found.add(id);
    } catch (_) { /* Reading notes remains available when storage is blocked. */ }
    function render() {
      root.querySelector("[data-coast-found]").textContent = found.size + " / 4";
      for (const note of root.querySelectorAll("[data-coast-note]")) note.dataset.found = String(found.has(note.dataset.coastNote));
      pocket.hidden = !found.has("shore-handheld");
      root.querySelector("[data-coast-handheld-note]").hidden = pocket.hidden;
      try { localStorage.setItem(storageKey, JSON.stringify([...found])); } catch (_) {}
    }
    function scene() { return root.querySelector("[data-gosx-scene3d-mounted]"); }
    function removeCollectedHandheld() {
      const s = scene();
      if (pickupApplied || !found.has("shore-handheld") || !s || s.getAttribute("data-gosx-scene3d-model-hydration-status") !== "committed") return;
      const commands = JSON.parse(root.dataset.coastPickup);
      s.dispatchEvent(new CustomEvent("gosx:scene3d:commands", {detail:{revision:1,commands}}));
      pickupApplied = true;
    }
    function send(action) {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type:"blackglass-handheld", action }, location.origin);
    }
    function openHandheld() {
      if (!dialog || dialog.open) return;
      previousFocus = document.activeElement;
      if (document.pointerLockElement) document.exitPointerLock();
      const s = scene();
      resumeCoast = !!s && s.getAttribute("data-gosx-scene3d-animation-state") === "playing";
      if (resumeCoast) root.querySelector("[data-gosx-scene3d-animation-toggle]").click();
      if (!frame) {
        frame = document.createElement("iframe");
        frame.title = "Playable pocket Game Boy Color";
        frame.src = "/demos/blackglass-handheld/pocket.html";
        frame.setAttribute("allow", "autoplay");
        frame.addEventListener("load", () => send(dialog.open ? "resume" : "pause"));
        dialog.appendChild(frame);
      }
      dialog.showModal();
      send("resume");
    }
    function observe(id, fromScene) {
      if (typeof id !== "string") return;
      id = id.split("/")[0];
      if (!keys.includes(id)) return;
      const first = !found.has(id);
      found.add(id); render(); removeCollectedHandheld();
      if (id === "shore-handheld") {
        status.textContent = first ? "A pocket-sized time capsule. Picked up." : "Your handheld is in your pocket.";
        openHandheld(); return;
      }
      const note = root.querySelector('[data-coast-note="' + id + '"]');
      if (fromScene && note) {
        if (document.pointerLockElement) document.exitPointerLock();
        journal.open = true; note.open = true;
        note.querySelector("summary").focus({ preventScroll:true });
      }
      status.textContent = note.querySelector("summary").textContent + " · recorded in your field journal.";
    }
    function pick(event) {
      const d = event.detail, input = d && d.kind === "pick" && d.input;
      if (input && input.type === "select") observe(input.targetID, true);
    }
    function activate(event) {
      const node = event.target.closest && event.target.closest("[data-gosx-scene-node]");
      if (node) observe(node.getAttribute("data-gosx-scene-node"), true);
    }
    root.addEventListener("gosx:scene3d:input", pick);
    root.addEventListener("gosx:scene3d:model-hydration-status", removeCollectedHandheld);
    root.addEventListener("click", activate);
    for (const note of root.querySelectorAll("[data-coast-note]")) note.addEventListener("toggle", () => { if (note.open && !found.has(note.dataset.coastNote)) observe(note.dataset.coastNote, false); });
    pocket.addEventListener("click", openHandheld);
    root.querySelector("[data-coast-put-away]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      send("pause");
      const s = scene();
      if (resumeCoast && s && s.getAttribute("data-gosx-scene3d-animation-state") === "paused") root.querySelector("[data-gosx-scene3d-animation-toggle]").click();
      resumeCoast = false;
      if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll:true });
    });
    function message(event) {
      if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
      if (event.data && event.data.type === "blackglass-handheld-close") dialog.close();
    }
    window.addEventListener("message", message);
    window.addEventListener("pagehide", () => { send("pause"); window.removeEventListener("message", message); });
    window.addEventListener("pageshow", event => {
      if (event.persisted) { window.addEventListener("message", message); send(dialog.open ? "resume" : "pause"); }
    });
    render(); removeCollectedHandheld();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once:true });
  else mount();
})();
