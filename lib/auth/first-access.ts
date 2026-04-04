import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const FIRST_ACCESS_DEFAULT_EMAIL = "admin@academia.local";
export const FIRST_ACCESS_DEFAULT_PASSWORD = "admin123";

export async function getFirstAccessUser() {
  return prisma.user.findUnique({
    where: { email: FIRST_ACCESS_DEFAULT_EMAIL }
  });
}

export async function isFirstAccessPending() {
  const user = await getFirstAccessUser();
  if (!user || !user.active) {
    return false;
  }

  return compare(FIRST_ACCESS_DEFAULT_PASSWORD, user.passwordHash);
}
