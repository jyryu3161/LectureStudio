'use client';

import { AlertCircle, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { duplicateCourseForTerm } from '@/lib/courses/duplicate';

/** Serializable course summary built server-side in app/admin/page.tsx. */
export interface DuplicateCourseItem {
  id: string;
  title: string;
  subtitle: string | null;
}

export interface DuplicateCourseSettingsProps {
  courses: DuplicateCourseItem[];
}

/**
 * Admin course-reuse — per-course "새 학기로 복제" control (PRD §10 multi-term
 * reuse). Renders one duplicate action per course; each opens a dialog for the
 * term label + "공개 판서도 복사" option and calls the author/admin-gated
 * duplicateCourseForTerm server action (all authz + the copy run server-side).
 * On success it links straight to the new term's reading page.
 */
export function DuplicateCourseSettings({ courses }: DuplicateCourseSettingsProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-16 sm:px-10">
      <SettingsHeading />
      {courses.length === 0 ? (
        <p className="mt-3 text-sm text-muted">복제할 수 있는 강의가 없습니다.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {courses.map((course) => (
            <li
              key={course.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{course.title}</p>
                {course.subtitle ? (
                  <p className="truncate font-mono text-xs text-muted">{course.subtitle}</p>
                ) : null}
              </div>
              <DuplicateCourseDialog course={course} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsHeading() {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Multi-term</p>
      <h2 className="mt-1.5 font-serif text-2xl text-ink">새 학기로 복제</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        기존 강의를 새 학기용으로 복제합니다. 챕터·블록·판서 앵커는 그대로 이어지고, 런타임과
        데모는 초안 상태로 복사되어 다시 빌드해야 합니다. 학생 코드 실행은 새 학기에서 기본적으로
        잠깁니다.
      </p>
    </div>
  );
}

function DuplicateCourseDialog({ course }: { course: DuplicateCourseItem }) {
  const router = useRouter();
  const labelId = useId();
  const annId = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [copyAnnotations, setCopyAnnotations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ courseId: string; chapterSlug: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setLabel('');
    setCopyAnnotations(false);
    setError(null);
    setDone(null);
  }, []);

  const onOpenChange = useCallback(
    (next: boolean) => {
      // Don't let a click-away cancel an in-flight copy.
      if (pending) return;
      setOpen(next);
      if (!next) reset();
    },
    [pending, reset],
  );

  const onSubmit = useCallback(() => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('학기 이름을 입력하세요.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await duplicateCourseForTerm(course.id, {
        label: trimmed,
        copyPublishedAnnotations: copyAnnotations,
      });
      if (result.ok) {
        setDone(result.data);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }, [label, copyAnnotations, course.id, router]);

  const readingHref = done
    ? done.chapterSlug
      ? `/reading/${done.courseId}/${done.chapterSlug}`
      : '/reading'
    : '#';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          새 학기로 복제
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 학기로 복제</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-ink">{course.title}</span> 강의를 새 학기용으로
            복제합니다.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm text-ink">
              <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
              새 학기 강의가 만들어졌습니다.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                닫기
              </Button>
              <Button asChild size="sm">
                <Link href={readingHref}>새 강의 열기</Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={labelId} className="text-sm font-medium text-ink">
                학기 이름
              </label>
              <input
                id={labelId}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 2026-2학기"
                maxLength={80}
                autoFocus
                disabled={pending}
                className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              />
            </div>

            <label htmlFor={annId} className="flex items-start gap-2 text-sm text-ink">
              <input
                id={annId}
                type="checkbox"
                checked={copyAnnotations}
                onChange={(e) => setCopyAnnotations(e.target.checked)}
                disabled={pending}
                className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <span>
                공개 판서도 복사
                <span className="mt-0.5 block text-xs text-muted">
                  공개된 강의 세션의 판서를 새 학기로 함께 복사합니다.
                </span>
              </span>
            </label>

            {error ? (
              <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button type="button" size="sm" onClick={onSubmit} disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    복제 중…
                  </>
                ) : (
                  '복제'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
