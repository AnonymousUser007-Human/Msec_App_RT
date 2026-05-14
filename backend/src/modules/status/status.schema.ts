import { z } from "zod";

export const createTextStatusSchema = z.object({
  content: z.string().min(1).max(1000),
});

export const updateTextStatusSchema = z.object({
  content: z.string().min(1).max(1000),
});
