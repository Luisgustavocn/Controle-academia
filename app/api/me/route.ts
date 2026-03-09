import { fail, ok } from "@/lib/api";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Nao autenticado", 401);
  return ok({ session });
}
