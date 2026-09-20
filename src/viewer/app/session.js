import { state } from "./state.js";
import { getViewAnchor } from "./zoom.js";
import { replaceSavedFile, getSavedFile, clearSavedFiles } from "./db.js";

// Keeps the open PDF and the reader's place in it, so reloading the tab (or
// reopening the browser) brings the same file back at the same spot instead of
// the empty screen. Highlights and notes already persist on their own.
//
// Only the most recent PDF is kept: its bytes sit in IndexedDB (browser storage
// for this extension) until another file replaces it. The reading position is a
// few numbers, kept in localStorage because it is written synchronously, so it
// still lands when the tab is closed or reloaded mid-scroll (an IndexedDB write
// started at that moment may never finish).

const POSITION_KEY = "petal-position";
// Scrolling fires constantly; write the position once it has been still a moment.
const SAVE_DELAY_MS = 200;

let saveTimer = null;
let saving = false;

function writePosition(position) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  } catch (err) {
    console.warn("Couldn't save the reading position", err);
  }
}

function readPosition() {
  try {
    return JSON.parse(localStorage.getItem(POSITION_KEY));
  } catch {
    return null;
  }
}

export async function rememberFile(hash, file) {
  try {
    await replaceSavedFile({ hash, file, savedAt: Date.now() });
    writePosition({ hash, scale: state.scale, anchor: null });
  } catch (err) {
    // Most likely over the storage quota: the PDF still opens, it just won't come back on reload.
    console.warn("Couldn't keep this PDF for reload", err);
  }
}

export async function loadSession() {
  const saved = await getSavedFile();
  if (!saved) return null;
  const position = readPosition();
  const mine = position?.hash === saved.hash ? position : null;
  return { hash: saved.hash, file: saved.file, scale: mine?.scale, anchor: mine?.anchor ?? null };
}

export function forgetSession() {
  try {
    localStorage.removeItem(POSITION_KEY);
  } catch {
    // nothing to clear
  }
  return clearSavedFiles().catch((err) => console.warn("Couldn't clear the saved session", err));
}

// Off while a file is opening (the position then is not the reader's), on once
// it is laid out and restored.
export function setSessionSaving(enabled) {
  saving = enabled;
  if (!enabled) clearTimeout(saveTimer);
}

export function scheduleSessionSave() {
  if (!saving) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

export function initSessionSaving(viewerMainEl) {
  viewerMainEl.addEventListener("scroll", scheduleSessionSave, { passive: true });
  // Reloading or closing the tab can beat the timer; write what we have now.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow();
  });
  window.addEventListener("pagehide", saveNow);
}

function saveNow() {
  clearTimeout(saveTimer);
  if (!saving || !state.pdfHash) return;
  const anchor = getViewAnchor();
  if (anchor) writePosition({ hash: state.pdfHash, scale: state.scale, anchor });
}
