declare module 'node-id3' {
  export interface Tags {
    title?: string;
    artist?: string;
    album?: string;
    image?: string | object;
    [key: string]: any;
  }
  export function write(tags: Tags, file: string, callback?: (err: Error | null) => void): boolean | Error;
  export function write(tags: Tags, file: string): boolean | Error;
  export function read(file: string): Tags;
}
