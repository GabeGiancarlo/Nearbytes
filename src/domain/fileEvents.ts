/**
 * File-level event types for the NearBytes file layer.
 */
export type FileEvent = CreateFileEvent | DeleteFileEvent;

/**
 * Event emitted when a file is created or updated.
 */
export interface CreateFileEvent {
  type: 'CREATE_FILE';
  filename: string;
  blobHash: string;
  size: number;
  mimeType?: string;
  createdAt: number;
}

/**
 * Event emitted when a file is deleted.
 */
export interface DeleteFileEvent {
  type: 'DELETE_FILE';
  filename: string;
  deletedAt: number;
}

/**
 * Materialized metadata for a file in the reconstructed state.
 */
export interface FileMetadata {
  filename: string;
  blobHash: string;
  size: number;
  mimeType?: string;
  createdAt: number;
}
