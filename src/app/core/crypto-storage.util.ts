/**
 * Secure Storage Utility for API Keys using Web Crypto API (AES-GCM-256)
 * and IndexedDB Key Storage.
 */

const DB_NAME = 'sila_secure_keystore';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_ALIAS = 'master_aes_key';

let cachedDecryptedKey: string | null = null;
let masterCryptoKeyPromise: Promise<CryptoKey> | null = null;

// Get or create persistent CryptoKey in IndexedDB
async function getMasterKey(): Promise<CryptoKey> {
  if (masterCryptoKeyPromise) return masterCryptoKeyPromise;

  masterCryptoKeyPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onerror = () => reject(request.error);

    request.onsuccess = async () => {
      const db = request.result;
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(KEY_ALIAS);

        getReq.onsuccess = async () => {
          let key: CryptoKey = getReq.result;
          if (!key) {
            // Generate a new AES-GCM 256 key
            key = await crypto.subtle.generateKey(
              { name: 'AES-GCM', length: 256 },
              false, // Non-extractable for maximum protection
              ['encrypt', 'decrypt']
            );
            // Save to IndexedDB
            const writeTx = db.transaction(STORE_NAME, 'readwrite');
            const writeStore = writeTx.objectStore(STORE_NAME);
            writeStore.put(key, KEY_ALIAS);
            writeTx.oncomplete = () => resolve(key);
            writeTx.onerror = () => reject(writeTx.error);
          } else {
            resolve(key);
          }
        };
        getReq.onerror = () => reject(getReq.error);
      } catch (err) {
        reject(err);
      }
    };
  });

  return masterCryptoKeyPromise;
}

// Helper: Convert ArrayBuffer to Base64
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Convert Base64 to ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypts a plain text API key using Web Crypto API (AES-GCM).
 * Returns `enc:v1:<IV_B64>:<CIPHER_B64>`.
 */
export async function encryptApiKey(plainKey: string): Promise<string> {
  if (!plainKey || !plainKey.trim()) return '';
  const trimmed = plainKey.trim();

  if (trimmed.startsWith('enc:v1:')) {
    return trimmed;
  }

  try {
    const key = await getMasterKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const encodedText = new TextEncoder().encode(trimmed);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedText
    );

    const ivB64 = bufferToBase64(iv.buffer);
    const cipherB64 = bufferToBase64(ciphertextBuffer);

    cachedDecryptedKey = trimmed;
    return `enc:v1:${ivB64}:${cipherB64}`;
  } catch (err) {
    console.warn('Failed to encrypt key via Web Crypto API, using direct memory cache', err);
    cachedDecryptedKey = trimmed;
    return trimmed;
  }
}

/**
 * Decrypts encrypted string `enc:v1:<IV_B64>:<CIPHER_B64>`.
 */
export async function decryptApiKey(cipherText: string): Promise<string> {
  if (!cipherText || !cipherText.trim()) return '';
  const trimmed = cipherText.trim();

  if (!trimmed.startsWith('enc:v1:')) {
    cachedDecryptedKey = trimmed;
    return trimmed;
  }

  try {
    const parts = trimmed.split(':');
    if (parts.length !== 4) return '';

    const ivB64 = parts[2];
    const cipherB64 = parts[3];

    const iv = new Uint8Array(base64ToBuffer(ivB64));
    const ciphertext = base64ToBuffer(cipherB64);
    const key = await getMasterKey();

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decryptedKey = new TextDecoder().decode(decryptedBuffer);
    cachedDecryptedKey = decryptedKey;
    return decryptedKey;
  } catch (err) {
    console.error('Failed to decrypt API key from localStorage:', err);
    return '';
  }
}

/**
 * Returns in-memory cached decrypted API key synchronously.
 */
export function getCachedApiKey(): string | null {
  return cachedDecryptedKey;
}

/**
 * Saves API key securely (encrypts to localStorage and keeps decrypted in memory).
 */
export async function saveSecureApiKey(plainKey: string): Promise<void> {
  const trimmed = plainKey.trim();
  if (!trimmed) {
    removeSecureApiKey();
    return;
  }
  cachedDecryptedKey = trimmed;
  const encrypted = await encryptApiKey(trimmed);
  if (typeof window !== 'undefined') {
    localStorage.setItem('user_openrouter_api_key', encrypted);
    localStorage.setItem('user_gemini_api_key', encrypted);
  }
}

/**
 * Removes API key from localStorage and memory cache.
 */
export function removeSecureApiKey(): void {
  cachedDecryptedKey = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user_openrouter_api_key');
    localStorage.removeItem('user_gemini_api_key');
  }
}

/**
 * Loads and decrypts API key from localStorage into memory cache.
 * Automatically upgrades legacy plain-text keys to encrypted keys in localStorage.
 */
export async function loadSecureApiKey(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const rawSaved = localStorage.getItem('user_openrouter_api_key') || localStorage.getItem('user_gemini_api_key');
  if (!rawSaved || !rawSaved.trim()) {
    cachedDecryptedKey = null;
    return '';
  }

  const trimmed = rawSaved.trim();

  if (!trimmed.startsWith('enc:v1:')) {
    cachedDecryptedKey = trimmed;
    saveSecureApiKey(trimmed).catch((err) => console.warn('Auto-upgrade key encryption error:', err));
    return trimmed;
  }

  return await decryptApiKey(trimmed);
}

/**
 * Checks if a key exists (encrypted or plain text).
 */
export function hasSecureApiKey(): boolean {
  if (cachedDecryptedKey && cachedDecryptedKey.trim()) return true;
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem('user_openrouter_api_key') || localStorage.getItem('user_gemini_api_key');
    return !!(raw && raw.trim());
  }
  return false;
}
