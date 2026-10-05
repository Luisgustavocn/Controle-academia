import { UserRole } from "@prisma/client";

/** @deprecated Prefer explicit capabilities. Kept only for compatibility. */
export function hasRole(userRole: UserRole, required: UserRole) {
  if (userRole === UserRole.ADMIN) return true;
  if (required === UserRole.ADMIN) return false;
  if (required === UserRole.FINANCEIRO) return userRole === UserRole.FINANCEIRO;
  if (required === UserRole.RECEPCAO) return userRole === UserRole.RECEPCAO;
  return userRole === UserRole.PERSONAL || userRole === UserRole.RECEPCAO;
}
