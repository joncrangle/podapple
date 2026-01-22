export interface Drive {
  id: string;
  name: string;
  mountPoint: string;
  totalSpace: number; // bytes
  freeSpace: number; // bytes
}
