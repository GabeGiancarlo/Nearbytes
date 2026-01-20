<script lang="ts">
  // UX Specification Implementation
  // Based on Vincenzo Ciancia's spec (Jan 3, 2026)
  
  // State: currentSecret, fileList, eventLog
  // Specification Point 1: Address input (volume identifier/secret seed)
  let currentSecret = $state('');
  // Specification Point 1: Optional second input for additional secret string
  let additionalSecret = $state('');
  let fileList = $state<FileMetadata[]>([]);
  let eventLog = $state<EventLogEntry[]>([]);
  let isDragging = $state(false);
  let errorMessage = $state('');

  // Type definitions (matching backend API)
  interface FileMetadata {
    name: string;
    contentAddress: string;
    eventHash: string;
  }

  // Specification Point 3: Event log model
  // create_file: References encrypted file hash
  // delete_file: References encrypted filename
  interface EventLogEntry {
    type: 'create_file' | 'delete_file';
    fileName: string;
    eventHash: string;
    // For create_file: encrypted file hash (content address)
    contentAddress?: string;
  }

  // Reactive behavior: fileList derived from currentSecret
  // Specification Point 1: Files appear immediately on input
  // Editing value instantly re-materializes different file set
  $effect(() => {
    // React to both secrets (if additional secret is used)
    const _ = additionalSecret; // Track dependency
    
    if (currentSecret.trim() === '') {
      // Specification Point 1: If input is empty → file area is blank
      fileList = [];
      eventLog = [];
      return;
    }

    // Load files when secret changes (reactive, no manual trigger)
    loadFiles();
  });

  // API boundary - clearly separated for Electron IPC replacement
  async function apiCall(endpoint: string, data: any) {
    try {
      const response = await fetch(`/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      // Check if response is empty
      const text = await response.text();
      if (!text) {
        throw new Error('Backend server returned empty response. Is the server running on port 4321?');
      }

      // Try to parse JSON
      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`Invalid response from server: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(jsonData.error || 'Request failed');
      }

      return jsonData;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Cannot connect to backend server. Make sure it\'s running on port 4321.';
      } else {
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
      }
      throw error;
    }
  }

  // Load files from volume
  // Specification Point 1: Files appear immediately on input (reactive)
  async function loadFiles() {
    if (!currentSecret.trim()) {
      fileList = [];
      eventLog = [];
      return;
    }

    try {
      errorMessage = '';
      // Combine secrets if additional secret is provided
      const secret = additionalSecret.trim() 
        ? `${currentSecret}:${additionalSecret}` 
        : currentSecret;
      
      // Load files and event log in parallel
      const [filesResult, eventsResult] = await Promise.all([
        apiCall('/volume/open', { secret }),
        apiCall('/volume/events', { secret }).catch(() => ({ events: [] })) // Fallback if endpoint doesn't exist
      ]);
      
      // Specification Point 1: Files materialize immediately
      fileList = filesResult.files || [];
      
      // Load event log from backend
      if (eventsResult.events && Array.isArray(eventsResult.events)) {
        eventLog = eventsResult.events.map((event: any) => {
          const eventType = event.payload.type === 'create_file' ? 'create_file' : 'delete_file';
          return {
            type: eventType,
            fileName: event.payload.fileName,
            eventHash: event.eventHash,
            contentAddress: eventType === 'create_file' ? event.payload.hash : undefined,
          };
        });
      } else {
        eventLog = [];
      }
    } catch (error) {
      console.error('Error loading files:', error);
      fileList = [];
      eventLog = [];
    }
  }

  // Specification Point 2: Drag-and-drop create
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

    if (!currentSecret.trim()) {
      errorMessage = 'Please enter an address first';
      return;
    }

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    try {
      errorMessage = '';
      
      // Process each dropped file
      for (const file of Array.from(files)) {
        // Read file as ArrayBuffer and convert to base64
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to base64 (handle large files efficiently)
        // Use FileReader for better performance with large files
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix if present
            const base64Data = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(new Blob([uint8Array]));
        });

        // Combine secrets if additional secret is provided
        const secret = additionalSecret.trim() 
          ? `${currentSecret}:${additionalSecret}` 
          : currentSecret;

        // Add file via API
        await apiCall('/files/add', {
          secret: secret,
          fileName: file.name,
          data: base64,
        });
      }

      // Reload files and event log to show new additions
      await loadFiles();
    } catch (error) {
      console.error('Error adding file:', error);
    }
  }

  // Specification Point 2: Delete files
  async function deleteFile(fileName: string) {
    if (!currentSecret.trim()) return;

    try {
      errorMessage = '';
      
      // Combine secrets if additional secret is provided
      const secret = additionalSecret.trim() 
        ? `${currentSecret}:${additionalSecret}` 
        : currentSecret;
      
      // Remove file via API
      await apiCall('/files/remove', {
        secret: secret,
        fileName: fileName,
      });

      // Reload files and event log to reflect deletion
      await loadFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }

  // Handle keyboard delete (Delete key)
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Delete' && e.target instanceof HTMLElement) {
      const fileItem = e.target.closest('[data-file-name]');
      if (fileItem) {
        const fileName = fileItem.getAttribute('data-file-name');
        if (fileName) {
          deleteFile(fileName);
        }
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="app">
  <!-- Specification Point 1: Top Input Area (Centered, Primary Focus) -->
  <div class="input-area">
    <div class="input-group">
      <input
        type="text"
        placeholder="Address"
        bind:value={currentSecret}
        class="address-input"
        autofocus
      />
      <!-- Specification Point 1: Optional second input (masked, password style) -->
      <!-- Optional: Leave empty to use just the primary secret, or enter a second secret to combine them -->
      <input
        type="password"
        placeholder="Optional (leave empty)"
        bind:value={additionalSecret}
        class="address-input secondary"
        title="Optional: Leave empty to use just the address above, or enter a second secret to combine them (format: address:additional)"
      />
    </div>
  </div>

  <!-- Specification Point 2: Main File Area (Dominant Blank Space) -->
  <div
    class="file-area"
    class:dragging={isDragging}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    {#if currentSecret.trim() === ''}
      <!-- Initial state: Blank with subtle drop hint -->
      <div class="empty-state">
        <p class="hint">Drop files here</p>
      </div>
    {:else if fileList.length === 0}
      <!-- Empty volume -->
      <div class="empty-state">
        <p class="hint">No files. Drop files here to add them.</p>
      </div>
    {:else}
      <!-- Files materialize: Flat list or grid -->
      <div class="file-grid">
        {#each fileList as file (file.eventHash)}
          <div class="file-item" data-file-name={file.name} tabindex="0">
            <div class="file-name">{file.name}</div>
            <button
              class="delete-btn"
              onclick={() => deleteFile(file.name)}
              aria-label="Delete {file.name}"
            >
              ×
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if errorMessage}
      <div class="error">{errorMessage}</div>
    {/if}
  </div>

  <!-- Specification Point 3: Event Log (Developer toggle) -->
  {#if import.meta.env.DEV}
    <details class="event-log">
      <summary>Event Log (Dev)</summary>
      <pre>{JSON.stringify(eventLog, null, 2)}</pre>
    </details>
  {/if}
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f5f5f5;
  }

  /* Specification Point 1: Centered input */
  .input-area {
    display: flex;
    justify-content: center;
    padding: 2rem;
    background: white;
    border-bottom: 1px solid #e0e0e0;
  }

  .input-group {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    max-width: 600px;
  }

  .address-input {
    flex: 1;
    padding: 1rem;
    font-size: 1.1rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    outline: none;
    transition: border-color 0.2s;
  }

  .address-input.secondary {
    max-width: 120px;
    flex: 0 0 auto;
  }

  .address-input:focus {
    border-color: #667eea;
  }

  /* Specification Point 2: Main file area */
  .file-area {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
    transition: background-color 0.2s;
  }

  .file-area.dragging {
    background-color: #e8f0fe;
    border: 2px dashed #667eea;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 400px;
  }

  .hint {
    color: #999;
    font-size: 1.1rem;
  }

  /* File grid (preferred for photos, but works for all files) */
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .file-item {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .file-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .file-item:focus {
    outline: 2px solid #667eea;
    outline-offset: 2px;
  }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delete-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #999;
    cursor: pointer;
    padding: 0 0.5rem;
    line-height: 1;
    transition: color 0.2s;
  }

  .delete-btn:hover {
    color: #f5576c;
  }

  .error {
    background: #fee;
    color: #c33;
    padding: 1rem;
    border-radius: 8px;
    margin-top: 1rem;
  }

  .event-log {
    padding: 1rem;
    background: #f9f9f9;
    border-top: 1px solid #e0e0e0;
    font-size: 0.85rem;
  }

  .event-log pre {
    margin: 0;
    overflow-x: auto;
  }
</style>
