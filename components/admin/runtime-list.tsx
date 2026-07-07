'use client';

import { AlertCircle, Boxes, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useState, useTransition } from 'react';

import { RuntimeStatusBadge } from '@/components/admin/runtime-badges';
import { Button } from '@/components/ui/button';
import { createRuntimeAction } from '@/lib/runtime/actions';

/** Python versions offered by the micromamba base image (PRD §10.4). */
const PYTHON_VERSIONS = ['3.10', '3.11', '3.12'] as const;

/** Serializable runtime summary built server-side in app/admin/runtimes/page.tsx. */
export interface RuntimeSummary {
  id: string;
  name: string;
  courseTitle: string | null;
  pythonVersion: string;
  status: 'draft' | 'building' | 'ready' | 'failed';
  imageTag: string | null;
}

export interface CourseOption {
  id: string;
  title: string;
}

export interface RuntimeListProps {
  runtimes: RuntimeSummary[];
  courses: CourseOption[];
}

/**
 * Admin Runtime Studio — list surface (client). Renders every runtime the
 * admin can see (RLS-scoped on the server) with its lifecycle badge + image
 * tag, and an inline "새 런타임" form that calls createRuntimeAction and routes
 * to the new runtime's detail page. All authz lives server-side in
 * lib/runtime; this component only adapts the ActionResult for display.
 */
export function RuntimeList({ runtimes, courses }: RuntimeListProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Admin</p>
          <h1 className="mt-1.5 font-serif text-3xl text-ink">런타임 스튜디오</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            코드 블록 실행에 사용할 컨테이너 런타임을 정의하고 빌드합니다. 런타임은 Docker
            이미지로 빌드되며, 준비되면 활성 상태로 표시됩니다.
          </p>
        </div>
        <Button
          type="button"
          variant="accent"
          onClick={() => setCreating((v) => !v)}
          aria-expanded={creating}
          aria-controls="new-runtime-form"
        >
          <Plus size={16} aria-hidden="true" />
          새 런타임
        </Button>
      </header>

      {creating ? (
        <NewRuntimeForm
          courses={courses}
          onCancel={() => setCreating(false)}
          onCreated={(id) => router.push(`/admin/runtimes/${id}`)}
        />
      ) : null}

      {runtimes.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-paper px-6 py-16 text-center">
          <Boxes size={28} className="text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">아직 런타임이 없습니다. 새 런타임을 만들어 보세요.</p>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {runtimes.map((rt) => (
            <li key={rt.id}>
              <Link
                href={`/admin/runtimes/${rt.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-paper px-5 py-4 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-serif text-lg text-ink">{rt.name}</span>
                    <RuntimeStatusBadge status={rt.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="font-mono">python {rt.pythonVersion}</span>
                    {rt.courseTitle ? <span>· {rt.courseTitle}</span> : null}
                    {rt.imageTag ? (
                      <span className="font-mono text-ink">· {rt.imageTag}</span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface NewRuntimeFormProps {
  courses: CourseOption[];
  onCancel: () => void;
  onCreated: (runtimeId: string) => void;
}

function NewRuntimeForm({ courses, onCancel, onCreated }: NewRuntimeFormProps) {
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [pythonVersion, setPythonVersion] = useState('3.11');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nameId = useId();
  const courseSelId = useId();
  const pySelId = useId();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmed = name.trim();
      if (!trimmed) {
        setError('런타임 이름을 입력하세요.');
        return;
      }
      if (!courseId) {
        setError('코스를 선택하세요.');
        return;
      }
      startTransition(async () => {
        const result = await createRuntimeAction(courseId, {
          name: trimmed,
          python_version: pythonVersion,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onCreated(result.data.id);
      });
    },
    [name, courseId, pythonVersion, onCreated],
  );

  return (
    <form
      id="new-runtime-form"
      onSubmit={handleSubmit}
      className="mb-6 rounded-2xl border border-accent/40 bg-paper p-5 ring-1 ring-accent/20"
    >
      <h2 className="mb-4 font-serif text-lg text-ink">새 런타임 만들기</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label htmlFor={nameId} className="text-xs font-medium text-ink">
            이름
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: python-basic"
            autoComplete="off"
            className="h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label htmlFor={courseSelId} className="text-xs font-medium text-ink">
            코스
          </label>
          <select
            id={courseSelId}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {courses.length === 0 ? <option value="">코스 없음</option> : null}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label htmlFor={pySelId} className="text-xs font-medium text-ink">
            Python 버전
          </label>
          <select
            id={pySelId}
            value={pythonVersion}
            onChange={(e) => setPythonVersion(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {PYTHON_VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" variant="accent" size="sm" disabled={isPending}>
          {isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
          만들기
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          취소
        </Button>
      </div>
    </form>
  );
}
