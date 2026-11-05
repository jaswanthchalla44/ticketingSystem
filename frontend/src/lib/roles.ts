// Role helpers. The UI uses these to show or hide screens. The API enforces every rule again.

export const ROLES = ['Customer', 'Agent', 'Admin'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { Customer: 0, Agent: 1, Admin: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Picks the highest role among Cognito groups. No known group means Customer, as the API does. */
export function highestRole(groups: readonly string[]): Role {
  let best: Role = 'Customer';
  for (const group of groups) {
    if (isRole(group) && RANK[group] > RANK[best]) best = group;
  }
  return best;
}

export const isStaff = (role: Role): boolean => role === 'Agent' || role === 'Admin';
export const isAdmin = (role: Role): boolean => role === 'Admin';

export const canUseWorkspace = isStaff;
export const canSeeDashboard = isAdmin;
export const canManageUsers = isAdmin;
/** Internal notes and staff-only ticket fields. */
export const canSeeInternal = isStaff;
export const canChangeTicketFields = isStaff;

export const ROLE_LABELS: Record<Role, string> = {
  Customer: 'Customer',
  Agent: 'Agent',
  Admin: 'Admin',
};

/** The screen a signed-in user lands on after sign-in. */
export function homePathFor(role: Role): string {
  return isStaff(role) ? '/workspace' : '/tickets';
}
