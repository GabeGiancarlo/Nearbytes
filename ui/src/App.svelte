<script lang="ts">
  import { openVolume, listFiles, uploadFiles, deleteFile, downloadFile, type Auth, type FileMetadata } from './lib/api.js';
  import { getCachedFiles, setCachedFiles, getCacheTimestamp } from './lib/cache.js';

  // State
  let currentSecret = $state('');
  let fileList = $state<FileMetadata[]>([]);
  let volumeId = $state<string | null>(null);
  let auth = $state<Auth | null>(null);
  let isDragging = $state(false);
  let errorMessage = $state('');
  let isLoading = $state(false);
  let isOffline = $state(false);
  let lastRefresh = $state<number | null>(null);
  let copiedVolumeId = $state(false);

  // Debounce timer reference
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Reactive: Load files when secret changes (debounced)
  $effect(() => {
    const secret = currentSecret.trim();

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (secret === '') {
      fileList = [];
      volumeId = null;
      auth = null;
      lastRefresh = null;
      isOffline = false;
      isLoading = false;
      return;
    }

    // Debounce: wait 500ms after user stops typing before loading
    debounceTimer = setTimeout(() => {
      loadVolume();
    }, 500);

    // Cleanup function
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };
  });

  // Load volume with optimistic caching
  async function loadVolume() {
    const secret = currentSecret.trim();
    if (!secret) return;

    isLoading = true;
    errorMessage = '';
    isOffline = false;

    try {
      // Open volume (this returns files + optional token)
      const response = await openVolume(secret);

      // Store auth for subsequent requests
      if (response.token) {
        auth = { type: 'token', token: response.token };
        // Store token in sessionStorage (not localStorage for security)
        sessionStorage.setItem('nearbytes-token', response.token);
      } else {
        auth = { type: 'secret', secret };
        sessionStorage.removeItem('nearbytes-token');
      }

      volumeId = response.volumeId;
      fileList = response.files;
      lastRefresh = Date.now();
      errorMessage = response.storageHint ?? '';

      // Cache the file list
      await setCachedFiles(volumeId, response.files);
    } catch (error) {
      // On error, try to show cached data
      if (volumeId) {
        const cached = await getCachedFiles(volumeId);
        if (cached) {
          fileList = cached;
          isOffline = true;
          errorMessage = 'Using cached data. Backend unavailable.';
        } else {
          errorMessage = error instanceof Error ? error.message : 'Failed to load volume';
          fileList = [];
        }
      } else {
        errorMessage = error instanceof Error ? error.message : 'Failed to load volume';
        fileList = [];
      }
    } finally {
      isLoading = false;
    }
  }

  // Refresh file list
  async function refreshFiles() {
    if (!auth || !volumeId) return;

    try {
      const response = await listFiles(auth);
      fileList = response.files;
      lastRefresh = Date.now();
      isOffline = false;
      errorMessage = '';

      // Update cache
      await setCachedFiles(volumeId, response.files);
    } catch (error) {
      // Try cached data
      const cached = await getCachedFiles(volumeId);
      if (cached) {
        fileList = cached;
        isOffline = true;
        errorMessage = 'Using cached data. Backend unavailable.';
      } else {
        errorMessage = error instanceof Error ? error.message : 'Failed to refresh';
      }
    }
  }

  // Drag and drop handlers
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;

    if (!auth || !currentSecret.trim()) {
      errorMessage = 'Please enter a secret first';
      return;
    }

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    try {
      errorMessage = '';
      await uploadFiles(auth, files);
      // Refresh file list
      await refreshFiles();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error('Error uploading files:', error);
    }
  }

  // Delete file
  async function handleDelete(filename: string) {
    if (!auth) return;

    try {
      errorMessage = '';
      await deleteFile(auth, filename);
      // Refresh file list
      await refreshFiles();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Delete failed';
      console.error('Error deleting file:', error);
    }
  }

  // Download file
  async function handleDownload(file: FileMetadata) {
    if (!auth) return;

    try {
      errorMessage = '';
      const blob = await downloadFile(auth, file.blobHash);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('Error downloading file:', error);
    }
  }

  // Copy volumeId to clipboard
  async function copyVolumeId() {
    if (!volumeId) return;
    try {
      await navigator.clipboard.writeText(volumeId);
      copiedVolumeId = true;
      setTimeout(() => {
        copiedVolumeId = false;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy volumeId:', error);
    }
  }

  // Format file size
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Format date
  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
</script>

<svelte:window onkeydown={(e) => {
  if (e.key === 'Delete' && e.target instanceof HTMLElement) {
    const fileItem = e.target.closest('[data-filename]');
    if (fileItem) {
      const filename = fileItem.getAttribute('data-filename');
      if (filename && auth) {
        handleDelete(filename);
      }
    }
  }
}} />

<div class="app">
  <!-- Header with branding and secret input -->
  <header class="header">
    <div class="header-content">
      <div class="brand">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h1 class="brand-title">Nearbytes</h1>
      </div>
      <div class="secret-input-wrapper">
        <input
          type="text"
          placeholder="Enter secret location..."
          bind:value={currentSecret}
          class="secret-input"
          autofocus
        />
        {#if isLoading}
          <span class="loading-spinner"></span>
        {/if}
      </div>
    </div>
  </header>

  <!-- Status bar -->
  {#if volumeId || errorMessage || isOffline}
    <div class="status-bar">
      {#if volumeId}
        <div class="status-item">
          <span class="status-label">Volume:</span>
          <button class="volume-id-btn" onclick={copyVolumeId} title="Copy volume ID">
            {volumeId.slice(0, 16)}...
            {#if copiedVolumeId}
              <span class="copied-indicator">✓ Copied</span>
            {/if}
          </button>
        </div>
      {/if}
      {#if lastRefresh}
        <div class="status-item">
          <span class="status-label">Last refresh:</span>
          <span class="status-value">{formatDate(lastRefresh)}</span>
        </div>
      {/if}
      {#if isOffline}
        <div class="status-item offline-indicator">
          <span>📴 Offline (cached)</span>
        </div>
      {/if}
      {#if errorMessage}
        <div class="status-item error-indicator">
          <span>{errorMessage}</span>
        </div>
      {/if}
      {#if volumeId && !isLoading}
        <button class="refresh-btn" onclick={refreshFiles} title="Refresh file list">
          ↻ Refresh
        </button>
      {/if}
    </div>
  {/if}

  <!-- Main file area -->
  <main
    class="file-area"
    class:dragging={isDragging}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    {#if currentSecret.trim() === ''}
      <!-- Initial state -->
      <div class="empty-state">
        <div class="empty-content">
          <svg class="empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32 8L8 20L32 32L56 20L32 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
            <path d="M8 20V44L32 56L56 44V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
            <path d="M32 32V56" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
          </svg>
          <p class="empty-hint">Enter a secret location to access your files</p>
          <p class="empty-subhint">Or drag and drop files here to create a new volume</p>
        </div>
      </div>
    {:else if fileList.length === 0 && !isLoading}
      <!-- Empty volume -->
      <div class="empty-state">
        <div class="empty-content">
          <svg class="empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32 8L8 20L32 32L56 20L32 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
            <path d="M8 20V44L32 56L56 44V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
            <path d="M32 32V56" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
          </svg>
          <p class="empty-hint">No files yet</p>
          <p class="empty-subhint">Drop files here to add them</p>
        </div>
      </div>
    {:else}
      <!-- File grid -->
      <div class="file-grid">
        {#each fileList as file (file.blobHash)}
          <div class="file-card" data-filename={file.filename} tabindex="0" role="button" onclick={() => handleDownload(file)}>
            <div class="file-icon">
              {#if file.mimeType?.startsWith('image/')}
                🖼️
              {:else if file.mimeType?.startsWith('text/')}
                📄
              {:else if file.mimeType?.includes('pdf')}
                📕
              {:else}
                📦
              {/if}
            </div>
            <div class="file-info">
              <div class="file-name" title={file.filename}>{file.filename}</div>
              <div class="file-meta">
                <span>{formatSize(file.size)}</span>
                <span>•</span>
                <span>{formatDate(file.createdAt)}</span>
              </div>
            </div>
            <div class="file-actions">
              <button
                class="action-btn download-btn"
                onclick={(e) => { e.stopPropagation(); handleDownload(file); }}
                title="Download {file.filename}"
                aria-label="Download {file.filename}"
              >
                ⬇
              </button>
              <button
                class="action-btn delete-btn"
                onclick={(e) => { e.stopPropagation(); handleDelete(file.filename); }}
                title="Delete {file.filename}"
                aria-label="Delete {file.filename}"
              >
                ×
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0a0a0f;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
  }

  /* Header */
  .header {
    background: rgba(26, 26, 46, 0.8);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(102, 126, 234, 0.2);
    padding: 1.5rem 2rem;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .brand-icon {
    width: 32px;
    height: 32px;
    color: #667eea;
  }

  .brand-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .secret-input-wrapper {
    flex: 1;
    min-width: 300px;
    max-width: 600px;
    position: relative;
  }

  .secret-input {
    width: 100%;
    padding: 0.875rem 1.25rem;
    font-size: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(102, 126, 234, 0.3);
    border-radius: 12px;
    color: #e0e0e0;
    outline: none;
    transition: all 0.2s ease;
  }

  .secret-input:focus {
    border-color: #667eea;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
  }

  .secret-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secret-input::placeholder {
    color: rgba(224, 224, 224, 0.4);
  }

  .loading-spinner {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    border: 2px solid rgba(102, 126, 234, 0.3);
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: translateY(-50%) rotate(360deg); }
  }

  /* Status bar */
  .status-bar {
    background: rgba(10, 10, 15, 0.6);
    border-bottom: 1px solid rgba(102, 126, 234, 0.1);
    padding: 0.75rem 2rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
    font-size: 0.875rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: rgba(224, 224, 224, 0.7);
  }

  .status-label {
    font-weight: 500;
    color: rgba(224, 224, 224, 0.5);
  }

  .status-value {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8125rem;
  }

  .volume-id-btn {
    background: rgba(102, 126, 234, 0.1);
    border: 1px solid rgba(102, 126, 234, 0.3);
    border-radius: 6px;
    padding: 0.25rem 0.75rem;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8125rem;
    color: #667eea;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }

  .volume-id-btn:hover {
    background: rgba(102, 126, 234, 0.2);
    border-color: #667eea;
  }

  .copied-indicator {
    margin-left: 0.5rem;
    color: #4ade80;
    font-size: 0.75rem;
  }

  .offline-indicator {
    color: #fbbf24;
  }

  .error-indicator {
    color: #f87171;
  }

  .refresh-btn {
    background: rgba(102, 126, 234, 0.2);
    border: 1px solid rgba(102, 126, 234, 0.3);
    border-radius: 6px;
    padding: 0.375rem 0.875rem;
    color: #667eea;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
    margin-left: auto;
  }

  .refresh-btn:hover {
    background: rgba(102, 126, 234, 0.3);
    border-color: #667eea;
  }

  /* File area */
  .file-area {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
    transition: background-color 0.3s ease;
  }

  .file-area.dragging {
    background: rgba(102, 126, 234, 0.1);
    border: 2px dashed #667eea;
    border-radius: 12px;
    margin: 1rem;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
  }

  .empty-content {
    text-align: center;
    max-width: 400px;
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 1.5rem;
    color: rgba(102, 126, 234, 0.3);
  }

  .empty-hint {
    font-size: 1.25rem;
    color: rgba(224, 224, 224, 0.8);
    margin: 0 0 0.5rem;
  }

  .empty-subhint {
    font-size: 0.9375rem;
    color: rgba(224, 224, 224, 0.5);
    margin: 0;
  }

  /* File grid */
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .file-card {
    background: rgba(26, 26, 46, 0.6);
    border: 1px solid rgba(102, 126, 234, 0.2);
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .file-card:hover {
    transform: translateY(-2px);
    border-color: #667eea;
    background: rgba(26, 26, 46, 0.8);
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
  }

  .file-card:focus {
    outline: 2px solid #667eea;
    outline-offset: 2px;
  }

  .file-icon {
    font-size: 2rem;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 500;
    color: #e0e0e0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 0.25rem;
  }

  .file-meta {
    font-size: 0.8125rem;
    color: rgba(224, 224, 224, 0.5);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .file-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: rgba(224, 224, 224, 0.7);
    font-size: 1.25rem;
    transition: all 0.2s;
    padding: 0;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .download-btn:hover {
    color: #667eea;
    border-color: #667eea;
  }

  .delete-btn:hover {
    color: #f87171;
    border-color: #f87171;
  }
</style>
