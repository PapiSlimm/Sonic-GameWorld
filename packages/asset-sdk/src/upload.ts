import type { UploadUrlInput, UploadUrlResult } from '@sonic-gameworld/gameworld-sdk';

/** Anything `uploadAsset` can upload: a browser `Blob`/`File`, or raw bytes in Node. */
export type UploadableFile = Blob | { data: Uint8Array; fileName: string; contentType: string };

export interface AssetUploadClient {
  assets: {
    uploadUrl(input: UploadUrlInput): Promise<UploadUrlResult>;
  };
}

export interface UploadAssetOptions {
  /** Overrides the file name inferred from a `File`/`Blob` (required for raw-byte uploads). */
  fileName?: string;
  /** Overrides the content type inferred from a `File`/`Blob` (required for raw-byte uploads). */
  contentType?: string;
  /** Attach this upload to an existing asset (creates a new version). */
  assetId?: string;
  /** Called with (bytesUploaded, totalBytes) — only fires in browsers (XMLHttpRequest). */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export interface UploadAssetResult {
  fileKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadUrl: string;
}

function isBlobLike(file: UploadableFile): file is Blob {
  return typeof Blob !== 'undefined' && file instanceof Blob;
}

function inferFileName(file: UploadableFile, override?: string): string {
  if (override) return override;
  if (isBlobLike(file) && 'name' in file && typeof (file as File).name === 'string') return (file as File).name;
  if (!isBlobLike(file)) return file.fileName;
  return 'upload.bin';
}

function inferContentType(file: UploadableFile, override?: string): string {
  if (override) return override;
  if (isBlobLike(file)) return file.type || 'application/octet-stream';
  return file.contentType || 'application/octet-stream';
}

function sizeOf(file: UploadableFile): number {
  return isBlobLike(file) ? file.size : file.data.byteLength;
}

/** PUT via `XMLHttpRequest` (browser) so `onProgress` can report upload progress. */
function putWithXhr(
  uploadUrl: string,
  method: string,
  headers: Record<string, string>,
  body: Blob | Uint8Array,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, uploadUrl, true);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (ev) => {
      if (onProgress) onProgress(ev.loaded, ev.lengthComputable ? ev.total : sizeOfBody(body));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    if (signal) {
      if (signal.aborted) xhr.abort();
      else signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(body as XMLHttpRequestBodyInit);
  });
}

function sizeOfBody(body: Blob | Uint8Array): number {
  return body instanceof Blob ? body.size : body.byteLength;
}

/** PUT via `fetch` (Node.js) — no progress events, but works with no DOM APIs. */
async function putWithFetch(
  uploadUrl: string,
  method: string,
  headers: Record<string, string>,
  body: Blob | Uint8Array,
  onProgress: ((loaded: number, total: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  const total = sizeOfBody(body);
  const res = await fetch(uploadUrl, { method, headers, body: body as BodyInit, signal });
  if (!res.ok) throw new Error(`Upload failed with status ${res.status}: ${res.statusText}`);
  onProgress?.(total, total);
}

/**
 * Upload a file to the presigned URL from `POST /v1/assets/upload-url`, then `PUT` the bytes
 * (§9 `assets:`). Reports progress via `XMLHttpRequest` when running in a browser; falls back
 * to a plain `fetch` PUT (no progress events) in Node.js.
 */
export async function uploadAsset(
  client: AssetUploadClient,
  file: UploadableFile,
  opts: UploadAssetOptions = {},
): Promise<UploadAssetResult> {
  const fileName = inferFileName(file, opts.fileName);
  const contentType = inferContentType(file, opts.contentType);
  const sizeBytes = sizeOf(file);

  const uploadUrlResult = await client.assets.uploadUrl({ fileName, contentType, sizeBytes, assetId: opts.assetId });
  const body: Blob | Uint8Array = isBlobLike(file) ? file : file.data;
  const headers: Record<string, string> = { 'content-type': contentType, ...uploadUrlResult.headers };

  if (typeof XMLHttpRequest !== 'undefined') {
    await putWithXhr(uploadUrlResult.uploadUrl, uploadUrlResult.method, headers, body, opts.onProgress, opts.signal);
  } else {
    await putWithFetch(uploadUrlResult.uploadUrl, uploadUrlResult.method, headers, body, opts.onProgress, opts.signal);
  }

  return { fileKey: uploadUrlResult.fileKey, fileName, contentType, sizeBytes, uploadUrl: uploadUrlResult.uploadUrl };
}
