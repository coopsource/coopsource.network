declare module 'multer' {
  import type { RequestHandler } from 'express';

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
    stream: NodeJS.ReadableStream;
    destination?: string;
    filename?: string;
    path?: string;
  }

  interface Options {
    dest?: string;
    storage?: unknown;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    fileFilter?: (
      req: Express.Request,
      file: File,
      callback: (error: Error | null, acceptFile: boolean) => void,
    ) => void;
  }

  interface Multer {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  function multer(options?: Options): Multer;

  export default multer;
  export { File, Options, Multer };
}
