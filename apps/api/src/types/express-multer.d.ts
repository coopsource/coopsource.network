declare global {
  namespace Express {
    interface Request {
      file?: import('multer').File;
      files?: import('multer').File[] | Record<string, import('multer').File[]>;
    }
  }
}

export {};
