# UX Specification Implementation

## Restatement of UX (In My Words)

A single-screen file/photo browsing UI where:
1. User pastes a secret "address" in a centered top input
2. Files immediately appear below (no buttons, fully reactive)
3. User can drag files into the area to add them
4. User can delete files (keyboard or button)
5. That's it - no other actions allowed

## UI Layout Structure

```
┌─────────────────────────────────────┐
│  [Centered Address Input] [•••]    │  ← Specification Point 1
├─────────────────────────────────────┤
│                                     │
│         [File Grid/List]            │  ← Specification Point 2
│                                     │
│                                     │
└─────────────────────────────────────┘
│  [Event Log - Dev Only]             │  ← Specification Point 3
└─────────────────────────────────────┘
```

## State Definition

```typescript
currentSecret: string        // Primary address input
additionalSecret: string     // Optional second secret (masked)
fileList: FileMetadata[]    // Materialized files
eventLog: EventLogEntry[]   // Internal event model
isDragging: boolean         // Drag state
errorMessage: string        // Error display
```

## Reactive Behavior Implementation

**Specification Point 1**: Files appear immediately on input

```typescript
$effect(() => {
  if (currentSecret.trim() === '') {
    fileList = [];  // Blank when empty
    return;
  }
  loadFiles();  // Auto-load when secret changes
});
```

**Verification**:
- ✅ Empty input → blank file area
- ✅ Input changes → files update automatically
- ✅ No refresh button needed
- ✅ No "load" button needed

## Feature Mapping to Specification

### Specification Point 1: Top Input Area

**Implementation**: `App.svelte` lines 187-200

- ✅ Centered input field (CSS: `.input-area` with `justify-content: center`)
- ✅ Primary focus (autofocus attribute)
- ✅ User pastes "address" (bind:value={currentSecret})
- ✅ Files appear immediately (reactive $effect)
- ✅ Editing changes files instantly (reactive $effect)
- ✅ Optional second input (masked, password style)
- ✅ Subtle hint only ("Address", "•••")

### Specification Point 2: Main File Area

**Implementation**: `App.svelte` lines 202-236

- ✅ Large blank canvas (flex: 1, min-height: 400px)
- ✅ Initial state: blank with subtle hint ("Drop files here")
- ✅ Files materialize when address present (conditional rendering)
- ✅ Grid layout (preferred for photos)
- ✅ Minimal chrome (filename + delete button)
- ✅ Drag-and-drop to add (handleDrop function)
- ✅ Delete files (keyboard Delete key + × button)
- ✅ No context menus
- ✅ No preview modal
- ✅ No sorting, filtering, pagination

### Specification Point 3: Event Log Model

**Implementation**: `App.svelte` lines 8, 129-133, 156-160, 239-244

- ✅ Internal event log model (eventLog state)
- ✅ Events: `create_file`, `delete_file`
- ✅ create_file references encrypted file hash (contentAddress)
- ✅ delete_file references encrypted filename
- ✅ Minimal UI exposure (dev toggle only)
- ✅ Message size leakage acceptable (no padding)

## Forbidden Features (Verified Absent)

**Explicitly Forbidden**:
- ❌ Rename - NOT implemented
- ❌ Move - NOT implemented
- ❌ Edit metadata - NOT implemented
- ❌ Share buttons - NOT implemented
- ❌ Permissions UI - NOT implemented
- ❌ Folders UI - NOT implemented
- ❌ Context menus - NOT implemented
- ❌ Preview modal - NOT implemented
- ❌ Sorting - NOT implemented
- ❌ Filtering - NOT implemented
- ❌ Pagination - NOT implemented

**Verification**: Code review confirms none of these features exist.

## Backend Assumptions

**Implementation**: `App.svelte` lines 39-57

- ✅ API boundary clearly separated (`apiCall` function)
- ✅ Can be replaced with Electron IPC (fetch → ipcRenderer.invoke)
- ✅ Uses existing Express server API
- ✅ Mock-friendly (can swap implementation)

**Electron IPC Replacement**:
```typescript
// Current (web):
const response = await fetch(`/api${endpoint}`, {...});

// Future (Electron):
const response = await ipcRenderer.invoke('nearbytes:api', endpoint, data);
```

## Technical Stack

- ✅ Svelte 5 (using runes: `$state`, `$effect`)
- ✅ TypeScript
- ✅ Electron-ready (no browser-only APIs)
- ✅ Vite for development

## Final Validation Checklist

✅ **Single screen UI** - All functionality on one screen  
✅ **Centered address input** - CSS centers input with max-width  
✅ **Files appear immediately on input** - Reactive $effect  
✅ **Editing secret changes files reactively** - $effect watches currentSecret  
✅ **Drag to add files** - handleDrop function  
✅ **Delete files only** - deleteFile function, keyboard Delete key  
✅ **No extra actions** - Verified no forbidden features  
✅ **Event-based internal model** - eventLog tracks create_file/delete_file  
✅ **Electron-compatible structure** - API boundary clearly separated  

## Implementation Status

✅ **Complete** - All specification points implemented  
✅ **Verified** - All forbidden features absent  
✅ **Reactive** - Files update automatically  
✅ **Ready** - Electron IPC can replace API calls  

## Code Comments Mapping

- Line 2-3: Specification reference
- Line 6: Specification Point 1 (address input)
- Line 7: Specification Point 1 (optional second input)
- Line 25-36: Specification Point 1 (reactive behavior)
- Line 38: Backend assumptions (API boundary)
- Line 60: Specification Point 1 (files materialize)
- Line 80: Specification Point 2 (drag-and-drop)
- Line 128-133: Specification Point 3 (create_file event)
- Line 143: Specification Point 2 (delete files)
- Line 150-160: Specification Point 3 (delete_file event)
- Line 186: Specification Point 1 (top input area)
- Line 197: Specification Point 2 (main file area)
- Line 238: Specification Point 3 (event log)

## Stop Condition

✅ **Specification satisfied** - All requirements met  
✅ **No speculative features** - Only specified features  
✅ **No premature optimization** - Simple, direct implementation  

**Status**: Implementation complete. Ready for use.
