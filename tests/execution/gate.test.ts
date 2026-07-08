import { describe, expect, it } from 'vitest';

import {
  canRunCode,
  canToggleStudentExecution,
  isElevatedRunRole,
} from '@/lib/auth/guards';

/**
 * The effective code-execution gate (PRD §10.5). This pure function is the
 * single source of truth mirrored by the executions_insert RLS policy
 * (migration 0008) and the server-side re-check in lib/runtime.queueExecution.
 */
describe('canRunCode — effective execution gate', () => {
  it('lets elevated roles run any executable block regardless of the opt-in', () => {
    for (const role of ['author', 'instructor', 'admin'] as const) {
      expect(
        canRunCode({ role, blockExecutable: true, studentExecutionEnabled: false }),
      ).toBe(true);
      expect(
        canRunCode({ role, blockExecutable: true, studentExecutionEnabled: true }),
      ).toBe(true);
    }
  });

  it('lets a student run only when the course has opted in', () => {
    expect(
      canRunCode({ role: 'student', blockExecutable: true, studentExecutionEnabled: true }),
    ).toBe(true);
    expect(
      canRunCode({ role: 'student', blockExecutable: true, studentExecutionEnabled: false }),
    ).toBe(false);
  });

  it('fails closed for a non-executable block, even for elevated roles', () => {
    expect(
      canRunCode({ role: 'admin', blockExecutable: false, studentExecutionEnabled: true }),
    ).toBe(false);
    expect(
      canRunCode({ role: 'student', blockExecutable: false, studentExecutionEnabled: true }),
    ).toBe(false);
  });

  it('fails closed for guests / non-members', () => {
    expect(
      canRunCode({ role: null, blockExecutable: true, studentExecutionEnabled: true }),
    ).toBe(false);
    expect(
      canRunCode({ role: undefined, blockExecutable: true, studentExecutionEnabled: true }),
    ).toBe(false);
  });
});

describe('isElevatedRunRole', () => {
  it('is true for author/instructor/admin and false otherwise', () => {
    expect(isElevatedRunRole('author')).toBe(true);
    expect(isElevatedRunRole('instructor')).toBe(true);
    expect(isElevatedRunRole('admin')).toBe(true);
    expect(isElevatedRunRole('student')).toBe(false);
    expect(isElevatedRunRole(null)).toBe(false);
  });
});

describe('canToggleStudentExecution', () => {
  it('allows author/admin course members and any platform admin', () => {
    expect(canToggleStudentExecution('author', false)).toBe(true);
    expect(canToggleStudentExecution('admin', false)).toBe(true);
    expect(canToggleStudentExecution('student', true)).toBe(true); // app admin overrides role
    expect(canToggleStudentExecution(null, true)).toBe(true);
  });

  it('rejects instructors/students/guests who are not platform admins', () => {
    expect(canToggleStudentExecution('instructor', false)).toBe(false);
    expect(canToggleStudentExecution('student', false)).toBe(false);
    expect(canToggleStudentExecution(null, false)).toBe(false);
  });
});
