/**
 * API client for Nearbytes Phase 2 backend.
 * Handles authentication, file operations, and error parsing.
 */

export type Auth = { type: 'token'; token: string } | { type: 'secret'; secret: string };

export interface FileMetadata {
  filename: string;
  blobHash: string;
  size: number;
  mimeType?: string;
  createdAt: number;
}

export interface OpenVolumeResponse {
  volumeId: string;
  fileCount: number;
  files: FileMetadata[];
  token?: string;
}

export interface ListFilesResponse {
  volumeId: string;
  files: FileMetadata[];
}

export interface UploadResponse {
  created: FileMetadata;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

const API_BASE = ''; // Use Vite proxy

/**
 * Creates auth headers for API requests.
 */
function createAuthHeaders(auth: Auth): HeadersInit {
  if (auth.type === 'token') {
    return {
      Authorization: `Bearer ${auth.token}`,
    };
  }
  return {
    'x-nearbytes-secret': auth.secret,
  };
}

/**
 * Parses API error responses.
 */
async function parseError(response: Response): Promise<ApiError> {
  try {
    const data = await response.json();
    if (data.error && typeof data.error === 'object') {
      return data as ApiError;
    }
  } catch {
    // Fallback if response isn't JSON
  }
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: response.statusText || 'Unknown error',
    },
  };
}

/**
 * Makes an API request with error handling.
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit & { auth?: Auth } = {}
): Promise<T> {
  const { auth, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);

  if (auth) {
    const authHeaders = createAuthHeaders(auth);
    Object.entries(authHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  if (!headers.has('Content-Type') && fetchOptions.body instanceof FormData === false) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await parseError(response);
    throw new Error(error.error.message || `Request failed: ${response.statusText}`);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response from server');
  }
}

/**
 * Opens a volume with a secret and returns volume info + files.
 * If token is returned, it should be used for subsequent requests.
 */
export async function openVolume(secret: string): Promise<OpenVolumeResponse> {
  return apiRequest<OpenVolumeResponse>('/open', {
    method: 'POST',
    body: JSON.stringify({ secret }),
  });
}

/**
 * Lists files for an authenticated volume.
 */
export async function listFiles(auth: Auth): Promise<ListFilesResponse> {
  return apiRequest<ListFilesResponse>('/files', {
    method: 'GET',
    auth,
  });
}

/**
 * Uploads one or more files using multipart/form-data.
 * Returns array of created file metadata.
 */
export async function uploadFiles(
  auth: Auth,
  files: FileList | File[]
): Promise<UploadResponse[]> {
  const fileArray = Array.from(files);
  const results: UploadResponse[] = [];

  for (const file of fileArray) {
    const formData = new FormData();
    formData.append('file', file);
    // Optional: allow filename override if needed
    // formData.append('filename', file.name);

    const result = await apiRequest<UploadResponse>('/upload', {
      method: 'POST',
      auth,
      body: formData,
    });
    results.push(result);
  }

  return results;
}

/**
 * Deletes a file by filename.
 */
export async function deleteFile(auth: Auth, filename: string): Promise<void> {
  const encodedName = encodeURIComponent(filename);
  await apiRequest(`/files/${encodedName}`, {
    method: 'DELETE',
    auth,
  });
}

/**
 * Downloads a file by blob hash.
 * Returns the file as a Blob.
 */
export async function downloadFile(auth: Auth, blobHash: string): Promise<Blob> {
  const headers = new Headers(createAuthHeaders(auth));
  const response = await fetch(`${API_BASE}/file/${blobHash}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const error = await parseError(response);
    throw new Error(error.error.message || `Download failed: ${response.statusText}`);
  }

  return response.blob();
}
