'use client';

import { AlertCircle, GraduationCap } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { setStudentExecutionEnabledAction } from '@/components/execution/actions';
import { Switch } from '@/components/ui/switch';

/** Serializable course row built server-side in app/admin/page.tsx. */
export interface StudentExecutionCourse {
  id: string;
  title: string;
  studentExecutionEnabled: boolean;
}

export interface StudentExecutionSettingsProps {
  courses: StudentExecutionCourse[];
}

/**
 * Admin course-settings — per-course "학생 코드 실행 허용" opt-in (PRD §10.5).
 *
 * Renders one switch per course the admin can administer. Flipping it calls the
 * app_admin/author-gated setStudentExecutionEnabledAction; all authz is
 * server-side (mirrored by RLS). Optimistic on success, reverts on error, and
 * surfaces the failure inline so nothing silently no-ops.
 */
export function StudentExecutionSettings({ courses }: StudentExecutionSettingsProps) {
  if (courses.length === 0) {
    return (
      <section className="mx-auto max-w-3xl px-6 pb-12 sm:px-10">
        <SettingsHeading />
        <p className="mt-3 text-sm text-muted">관리할 수 있는 강의가 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pb-12 sm:px-10">
      <SettingsHeading />
      <ul className="mt-4 flex flex-col gap-2">
        {courses.map((course) => (
          <CourseToggleRow key={course.id} course={course} />
        ))}
      </ul>
    </section>
  );
}

function SettingsHeading() {
  return (
    <div className="flex items-center gap-2">
      <GraduationCap size={16} className="text-accent" aria-hidden="true" />
      <h2 className="font-serif text-lg text-ink">학생 코드 실행</h2>
    </div>
  );
}

function CourseToggleRow({ course }: { course: StudentExecutionCourse }) {
  const switchId = useId();
  const errorId = useId();
  const [enabled, setEnabled] = useState(course.studentExecutionEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onToggle = (next: boolean) => {
    const previous = enabled;
    setEnabled(next); // optimistic
    setError(null);
    startTransition(async () => {
      const result = await setStudentExecutionEnabledAction(course.id, next);
      if (!result.ok) {
        setEnabled(previous); // revert
        setError(result.error);
        return;
      }
      setEnabled(result.data.enabled);
    });
  };

  return (
    <li className="flex flex-col gap-1.5 rounded-2xl border border-border bg-paper px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={switchId} className="min-w-0 cursor-pointer">
          <span className="block truncate text-sm text-ink">{course.title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            학생 코드 실행 허용 — 켜면 이 강의의 학생이 실행 가능한 코드 블록을 실행할 수 있습니다.
          </span>
        </label>
        <Switch
          id={switchId}
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={pending}
          aria-label={`${course.title} 학생 코드 실행 허용`}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs text-red-700"
        >
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </li>
  );
}
