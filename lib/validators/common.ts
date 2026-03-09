import { z } from "zod";

export const competenciaSchema = z.string().regex(/^\\d{4}-\\d{2}$/);
export const idSchema = z.string().min(1);
