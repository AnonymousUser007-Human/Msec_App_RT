import { z } from "zod";

export const startLiveSchema = z.object({
  title: z.string().min(1).max(120),
});
