-- supabase/seed.sql
-- MVP0 seed data: one course, one version, one chapter with MyST source
-- covering every required block type, and two course_members (author +
-- student). Run automatically by `supabase db reset`.
--
-- The example topic is deliberately domain-neutral (an introductory
-- computer-science algorithm) -- it only exists to exercise the block
-- pipeline (heading / lecture-summary / student-detail / instructor-note /
-- equation / code) and can be swapped for any subject without touching code.
--
-- NOTE on fixed UUIDs: the two user ids below (...0001 author, ...0002
-- student) do NOT yet exist in auth.users -- course_members.user_id has
-- no FK to auth.users on purpose (see migrations/0001_init.sql), so this
-- seed can run before real accounts exist. The Auth workstream should
-- either create auth.users rows with these exact ids (e.g. via the
-- Supabase Admin API / `supabase auth admin` with a fixed uuid) or swap
-- these ids for the real ones once sign-up is wired up.

insert into courses (id, title, subtitle, description, owner_id, visibility)
values (
  '11111111-1111-1111-1111-111111111111',
  '알고리즘과 자료구조',
  'CS-201',
  '학부 2학년 컴퓨터공학 전공 - 기본 알고리즘과 자료구조 입문 강의.',
  '00000000-0000-0000-0000-000000000001',
  'private'
);

insert into course_versions (id, course_id, label)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'v1'
);

update courses
set current_version_id = '22222222-2222-2222-2222-222222222222'
where id = '11111111-1111-1111-1111-111111111111';

insert into course_members (course_id, user_id, role)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'author'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', 'student');

-- Ch.03 Merge Sort -- a domain-neutral example that covers every block type
-- the scaffold needs to prove out: heading, lecture-summary, student-detail,
-- instructor-note, equation, code. The Content Engine (S2) re-parses this
-- into content_blocks with stable ids on first load -- no block rows are
-- hand-authored here on purpose.
insert into chapters (id, course_id, version_id, title, slug, order_index, source)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '병합 정렬',
  'merge-sort',
  3,
  $md$# 03장 · 병합 정렬(Merge Sort)

:::lecture-summary
병합 정렬은 배열을 절반씩 나누어 각각 정렬한 뒤 다시 병합하는 분할 정복 알고리즘으로, 입력에 상관없이 항상 O(n log n) 시간에 동작한다.
:::

:::student-detail
정렬되지 않은 배열을 더 이상 나눌 수 없을 때까지 절반으로 쪼갠 다음, 이미 정렬된 두 부분 배열을 하나로 합치는 병합 과정을 반복한다. 병합 단계에서 각 원소를 한 번씩만 비교·복사하기 때문에 안정 정렬이면서도 예측 가능한 성능을 보인다.
:::

:::instructor-note
학생들에게 "왜 최악의 경우에도 O(n log n)이 보장되는가?"를 먼저 질문한 뒤, 재귀 트리의 깊이(log n)와 각 레벨의 병합 비용(n)으로 연결한다. 시간이 남으면 퀵 정렬의 최악 사례(O(n²))와 비교한다.
:::

## 점화식과 시간 복잡도

병합 정렬의 실행 시간은 다음 점화식으로 표현되며, 마스터 정리에 의해 $O(n \log n)$이 된다.

:::equation
$$ T(n) = 2\,T\!\left(\frac{n}{2}\right) + \Theta(n) \;\Longrightarrow\; T(n) = \Theta(n \log n) $$
:::

## 파이썬 구현

```python
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left = merge_sort(a[:mid])
    right = merge_sort(a[mid:])
    return merge(left, right)


def merge(left, right):
    result, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i]); i += 1
        else:
            result.append(right[j]); j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
```

## 시각 자료

아래 그림은 길이 8 배열이 분할되었다가 다시 병합되는 전체 흐름을 보여준다.

:::{figure} /figures/merge-sort-tree.svg
:alt: 병합 정렬 분할-병합 트리 다이어그램

그림 3-1. 길이 8 배열이 절반씩 분할된 뒤, 정렬된 부분 배열로 다시 병합되는 과정.
:::

:::{video}
병합 정렬의 분할·병합 단계를 애니메이션으로 보여주는 강의 영상 (준비 중).
:::

## 체크 질문

길이가 8인 배열을 병합 정렬할 때, 병합(merge) 연산은 총 몇 번 수행되는가?
$md$
);

-- ---------------------------------------------------------------------------
-- Runtime Studio seed (MVP3, 0004_runtime.sql).
--
-- One minimal runtime for the seed course: bare python 3.11, no extra conda/
-- pip/apt packages so its Docker image builds fast. Left as status='draft' --
-- the Runtime Studio UI (or the worker via queueBuild) turns it into a
-- 'ready' image; we don't ship a prebuilt image_tag in the seed.
-- ---------------------------------------------------------------------------
insert into runtimes (id, course_id, name, python_version, status)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'python-basic',
  '3.11',
  'draft'
);
