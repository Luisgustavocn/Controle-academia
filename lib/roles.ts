import { UserRole } from "@prisma/client";

export const roleHierarchy: Record<UserRole, number> = {
  ADMIN: 4,
  FINANCEIRO: 3,
  RECEPCAO: 2,
  PERSONAL: 1
};

export function hasRole(userRole: UserRole, required: UserRole) {
  return roleHierarchy[userRole] >= roleHierarchy[required];
}
