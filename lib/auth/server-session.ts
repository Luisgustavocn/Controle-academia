import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function getActiveSessionUser(): Promise<SessionUser | null> {
  const session = await getSessionUser();
  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true
    }
  });

  if (!user?.active) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}
