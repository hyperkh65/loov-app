const DB_NAME = 'loov-camera-roll';
const STORE = 'photos';
const VERSION = 1;

export interface StoredPhoto {
  id: string;
  dataUrl: string;
  processedUrl?: string;
  filter: string;
  filterCss: string;
  timestamp: string;
  lat?: number;
  lng?: number;
  uploaded?: boolean;
  cloudinaryUrl?: string;
  isSecret?: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbSavePhoto(photo: StoredPhoto): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(photo);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function dbGetPhotos(): Promise<StoredPhoto[]> {
  const db = await openDB();
  const result = await new Promise<StoredPhoto[]>((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result as StoredPhoto[]);
    req.onerror = () => rej(req.error);
  });
  db.close();
  // Newest first
  return result.sort((a, b) => b.id.localeCompare(a.id));
}

export async function dbDeletePhoto(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function dbUpdatePhoto(id: string, patch: Partial<StoredPhoto>): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, ...patch });
      res();
    };
    req.onerror = () => rej(req.error);
  });
  db.close();
}
