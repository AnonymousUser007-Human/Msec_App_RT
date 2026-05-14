export {};

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
      file?: Express.Multer.File;
    }
  }
}
