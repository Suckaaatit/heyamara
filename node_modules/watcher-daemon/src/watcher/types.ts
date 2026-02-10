export type FileEventType = 'created' | 'modified' | 'deleted';

export interface FileEvent {
  type: FileEventType;
  path: string;
  timestamp: number;
}
