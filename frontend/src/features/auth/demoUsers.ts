// Seeded users from backend/src/helpdesk/auth.py. Used only by the local preview sign-in. Cognito mode never shows them.
import type { Role } from '@/lib/roles';

export interface DemoUser {
  name: string;
  email: string;
  role: Role;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { name: 'Dana Okoye', email: 'dana.okoye@example.test', role: 'Admin' },
  { name: 'Priya Raman', email: 'priya.raman@example.test', role: 'Agent' },
  { name: 'Marcus Chen', email: 'marcus.chen@example.test', role: 'Agent' },
  { name: 'Lena Costa', email: 'lena.costa@example.test', role: 'Agent' },
  { name: 'Tomasz Nowak', email: 'tomasz.nowak@example.test', role: 'Agent' },
  { name: 'Sam Okafor', email: 'sam.okafor@example.test', role: 'Customer' },
  { name: 'Elena Ruiz', email: 'elena.ruiz@example.test', role: 'Customer' },
  { name: 'Jordan Lee', email: 'jordan.lee@example.test', role: 'Customer' },
  { name: 'Aisha Khan', email: 'aisha.khan@example.test', role: 'Customer' },
  { name: 'Ben Walsh', email: 'ben.walsh@example.test', role: 'Customer' },
];
