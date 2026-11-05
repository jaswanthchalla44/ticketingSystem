import { describe, expect, it } from 'vitest';
import { canManageUsers, canSeeDashboard, canUseWorkspace, highestRole, homePathFor, isRole, isStaff } from './roles';

describe('highestRole', () => {
  it('picks Admin over Agent and Customer when several groups are present', () => {
    expect(highestRole(['Customer', 'Admin', 'Agent'])).toBe('Admin');
    expect(highestRole(['Agent', 'Customer'])).toBe('Agent');
  });

  it('treats no group, or only unknown groups, as Customer', () => {
    expect(highestRole([])).toBe('Customer');
    expect(highestRole(['Wizards', 'eu-west-1_pool'])).toBe('Customer');
  });

  it('ignores group names that differ only in case', () => {
    expect(highestRole(['admin'])).toBe('Customer');
  });
});

describe('role capabilities', () => {
  it('lets only Admins see the dashboard and manage users', () => {
    expect(canSeeDashboard('Admin')).toBe(true);
    expect(canSeeDashboard('Agent')).toBe(false);
    expect(canManageUsers('Admin')).toBe(true);
    expect(canManageUsers('Customer')).toBe(false);
  });

  it('lets staff use the workspace, and customers not', () => {
    expect(canUseWorkspace('Agent')).toBe(true);
    expect(canUseWorkspace('Admin')).toBe(true);
    expect(canUseWorkspace('Customer')).toBe(false);
    expect(isStaff('Customer')).toBe(false);
  });

  it('sends each role to its own home screen', () => {
    expect(homePathFor('Customer')).toBe('/tickets');
    expect(homePathFor('Agent')).toBe('/workspace');
    expect(homePathFor('Admin')).toBe('/workspace');
  });

  it('recognises only the three roles', () => {
    expect(isRole('Agent')).toBe(true);
    expect(isRole('Superuser')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
