const DB_NAME = "petal-db";
const DB_VERSION = 2;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pdfs")) {
        db.createObjectStore("pdfs", { keyPath: "hash" });
      }
      if (!db.objectStoreNames.contains("highlights")) {
        const store = db.createObjectStore("highlights", { keyPath: "id" });
        store.createIndex("pdfHash_page", ["pdfHash", "page"]);
      }
      if (!db.objectStoreNames.contains("notes")) {
        const store = db.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("pdfHash_page", ["pdfHash", "page"]);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function toPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name, mode) {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function getPdfRecord(hash) {
  return toPromise((await store("pdfs", "readonly")).get(hash));
}

export async function putPdfRecord(record) {
  return toPromise((await store("pdfs", "readwrite")).put(record));
}

export async function getHighlightsForPage(pdfHash, page) {
  const s = await store("highlights", "readonly");
  return toPromise(s.index("pdfHash_page").getAll([pdfHash, page]));
}

export async function putHighlight(highlight) {
  return toPromise((await store("highlights", "readwrite")).put(highlight));
}

export async function deleteHighlight(id) {
  return toPromise((await store("highlights", "readwrite")).delete(id));
}

export async function getNotesForPage(pdfHash, page) {
  const s = await store("notes", "readonly");
  return toPromise(s.index("pdfHash_page").getAll([pdfHash, page]));
}

export async function putNote(note) {
  return toPromise((await store("notes", "readwrite")).put(note));
}

export async function deleteNote(id) {
  return toPromise((await store("notes", "readwrite")).delete(id));
}
