# Lecture Studio — MVP 구현 계획 (Plan)

> 출처: `ref/final.md` (강의형 전자책 플랫폼 PRD v1.0) + `ref/design.zip` (5화면 목업)
> 계획 주체: Fable 5 · 구현: Sonnet 5 subagents · 검증: Fable 5 · 방식: Workflow 루프 + 티어별 체크포인트
> 최종 갱신: 2026-07-07

---

## 0. 한 줄 정의

**AI로 쉽게 만들고, 전자책 그대로 강의하고, 판서까지 남기며, 강의별 실행환경까지 제공하는 강의형 전자책 플랫폼.** One Source, Multiple Modes.

---

## 1. 확정된 설계 결정 (grilling 8)

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| 1 | 루프 축 | **MVP 티어별 수직 슬라이스** (Loop1=MVP0 … Loop4=MVP3) | PRD §21.2 우선순위, 각 루프 shippable, YAGNI |
| 2 | 인프라 | **로컬 Supabase 스택** (CLI+Docker, migrations as code) | 재현성·무자격증명, 나중 `db push`로 클라우드 |
| 3 | 파서 | **진짜 MyST (`myst-parser` JS)** → mdast AST | PRD §5.4 "MyST 호환", `myst-to-react` 렌더 기반 존재 |
| 4 | UI 스택 | **Tailwind + shadcn/ui** (Radix), 디자인 토큰화 | Next 표준, 컴포넌트 코드 소유(ponytail) |
| 5 | 루프 실행 | **Workflow 오케스트레이션 + 티어별 체크포인트** | 통제와 자동화 균형, 티어마다 사용자 승인 |
| 6 | 검증 | **다층 게이트 + 불변식 회귀 테스트** | AC·보안 불변식 자동 검증 |
| 7 | 소스 저장 | **Supabase 운영 저장소** (DB에 MyST 원본 + block index) | 인앱 저작과 정합, Git canonical은 나중 optional |
| 8 | 인증 | **실제 Auth + 역할 + instructor-note 필터링, UI 최소** | 보안 불변식을 MVP0부터, over-scope 회피 |

### 제품 기본값 (조정 가능)
- 제품명 **Lecture Studio** · Next.js 15 App Router + React 19 + TypeScript + npm · 단일 앱(Execution Worker는 Loop 4)
- 에디터 **CodeMirror 6** (MyST 소스, §6.1 Markdown-우선) + 라이브 프리뷰
- 수식 **KaTeX** · 코드 하이라이트 **Shiki** · 에셋 **Supabase Storage**
- 시드 콘텐츠: `CS-201 알고리즘과 자료구조` Ch.03 병합 정렬(한국어, 도메인 중립) + 전 블록타입 예시(instructor-note 포함)
- 테스트 **Vitest + Playwright** · Lint **ESLint + Prettier**
- 작업 브랜치 `feat/mvp0` 등 티어별 브랜치, 티어 통과마다 커밋(원격 푸시는 요청 시)

### 디자인 토큰 (design.zip 추출)
- 폰트: `Instrument Sans`(UI) · `Source Serif 4`(본문 세리프) · `JetBrains Mono`(코드/라벨)
- 색: 레일 `#16181c` · 배경 `#ececea`/`#fbfbfa` · 텍스트 `#16181c` · 액센트(인디고) `#43507e` · 선택 `#dfe2f0`
- 레이아웃: 좌측 66px 앱 레일 → 스테이지(모드별) · 라운드 10~18px · 은은한 그림자

---

## 2. 실행 모델 (루프)

```
각 Loop (= 1 MVP 티어):
  1. [Fable 5] 계획 + 태스크 분해 + Acceptance Criteria 체크리스트   ← 본 문서/티어별 계획
  2. [Sonnet 5 × N] 병렬 구현 (disjoint 경로, 충돌 없음)
  3. [Fable 5] 검증: build/type/lint → 앱 기동 → Playwright 구동 → AC 대조 → 불변식 테스트
  4. 실패 시 [Sonnet 5] 결함 수정 → 재검증  (최대 3회)
  5. 통과 시 커밋 → ⏸ 사용자에게 결과 보고·다음 티어 승인 요청
```

- **모델 라우팅**: 메인 세션 = Fable 5(effort max) → 계획·검증 담당. 구현 subagent만 `model: sonnet` 오버라이드.
- **ponytail full 유지**: subagent는 사다리(YAGNI→재사용→stdlib→네이티브→기존 의존성→한 줄) 준수. **단, 트러스트 경계 검증·데이터 손실 처리·보안·접근성은 절대 생략 금지.**
- **충돌 회피**: 스캐폴드 단계가 공유 파일(package.json/layout/config/전 의존성)을 선점 → 이후 병렬 agent는 자기 하위 트리만 수정.

---

## 3. 멀티 루프 아크 (PRD MVP 매핑)

| Loop | PRD | 산출 | 티어 계획 단계에서 결정할 열린 이슈 |
|------|-----|------|-----------------------------------|
| **1** | MVP 0 | 저작→읽기 루프: 파서/stable ID/Reading/최소 저작·인증 | — (본 문서에서 확정) |
| **2** | MVP 1 | Lecture Mode + Block annotation + 세션 + drift + PDF fallback | annotation 구현 tldraw vs 커스텀 SVG/canvas (#4) |
| **3** | MVP 2 | AI Authoring Assistant (draft-only + provenance + approval) | AI provider/키, 모델 선택 |
| **4** | MVP 3 | Admin Runtime Studio + Docker 코드 실행 | 코드 실행 보안 정책(#5), 패키지 매니저 micromamba vs pixi/uv(#6) |
| (later) | MVP 4 | Marimo interactive demo, Focus Lecture Mode, PDF/ePub export, GIF 생성 | export=Quarto 시점(#8) 등 |

범위 제외(PRD §22): 학생용 AI Tutor/RAG, Generated Slide Mode, 완전 LMS, 출석·성적, 대규모 실시간 다중 annotation, 강의녹화 타임라인, 완전 WYSIWYG, GPU runtime production.

---

## 4. Loop 1 (MVP 0) 상세 설계

### 4.1 목표 & 성공 기준 (PRD §17)
- Author가 MyST/Markdown으로 한 개 Course를 작성 → 학생용 Reading Mode로 볼 수 있다.
- **모든 Block은 stable ID + content_hash를 가지며, 편집 후에도 ID가 유지된다.**
- 수식·코드·이미지가 렌더된다. 좌측 목차·현재 위치 표시.
- Supabase Auth/DB/Storage 기본 연결.

### 4.2 아키텍처 (콘텐츠 파이프라인)
```
MyST source (DB: chapters.source)
  ↓ myst-parser (server, ESM, RSC/route handler)
mdast AST + 커스텀 directives
  ↓ block 추출: 최상위 노드 = 1 Block
  ↓ stable ID 주입(원본에 역기록) + content_hash(sha256 of normalized block source)
content_blocks (DB block index)
  ↓ myst-to-react 래핑 + 권한 필터(instructor-note 서버 제거) + data-block-id/hash
Reading Mode (RSC 렌더)
```

### 4.3 데이터 모델 (MVP0 = 7 테이블)
`users`(Supabase auth 연동) · `courses` · `course_members`(role: admin|author|instructor|student) · `course_versions` · `chapters` · `content_blocks` · `assets`

핵심 컬럼(요지):
```sql
courses(id uuid pk, title, subtitle, description, owner_id uuid,
        visibility text, current_version_id uuid, created_at, updated_at)
chapters(id uuid pk, course_id, version_id, title, slug, order_index int,
         source text,               -- MyST 원본 (운영 저장소)
         created_at, updated_at)
content_blocks(id text pk,          -- 'blk_' + nanoid (내용/위치 비의존)
         course_id, chapter_id, version_id,
         block_type text,           -- heading|paragraph|lecture-summary|student-detail|
                                    --   instructor-note|equation|figure|code|code-output|...
         order_index int,
         content_hash text,         -- drift 판정 기준
         visibility text,           -- public|instructor|... (instructor-note=instructor)
         source_range jsonb, metadata jsonb, created_at, updated_at)
course_members(course_id, user_id, role text, primary key(course_id,user_id))
assets(id uuid pk, course_id, kind, storage_path, alt_text, caption, metadata jsonb)
```

### 4.4 Block stable ID 정책 (PRD §5.3 — MVP0 필수)
- 생성 시 `blk_<nanoid>` 부여. 내용·위치·순서 **비의존**.
- 이동/재정렬돼도 ID 유지. 내용 수정 시 ID 유지 + `content_hash`만 갱신.
- **ID를 원본 MyST에도 저장**(예: 블록 앞 주석 `<!-- blk:blk_9f2a -->` 또는 directive 옵션). 렌더 HTML에 `data-block-id` + `data-content-hash`.
- 파싱 시 원본에 ID가 없으면 신규 발급 후 원본에 역기록(idempotent). 있으면 재사용.

### 4.5 접근 제어 — instructor-note (PRD §5.6 / §15.3, 보안 불변식)
- `instructor-note` 블록은 학생/게스트 응답에 **서버 렌더링 단계에서 제거**. CSS 숨김 금지.
- 요청자 role을 서버에서 판정 → 비권한자에겐 블록 자체를 payload/DOM에서 배제.
- **검증 불변식 A**: 학생 계정 어떤 API 응답에도 instructor-note 원문 부재. 브라우저 DOM에도 부재.

### 4.6 화면 (design.zip 일치)
- **Landing**: 히어로("Write an ebook. It becomes your lecture."), One Source·Multiple Modes 뱃지, 데모 진입 버튼.
- **Reading Mode**: 66px 레일 · 좌 Course 목차 · 중앙 본문(세리프) · 우 "On this page"/세션 셀렉터(자리만)·개인 메모 · 상단 강좌/한영 토글. 반응형(모바일/태블릿/데스크톱).
- **Authoring Studio (최소)**: CodeMirror MyST 에디터 + 라이브 Reading 프리뷰 + 저장 + Block Inspector(타입·학생노출 여부 readout).
- (Lecture / Admin 화면은 Loop 2 / Loop 4)

### 4.7 렌더링 세부
- 수식: KaTeX (`equation` 블록 + 인라인). 코드: Shiki(SSR, 정확). 이미지: `figure`=alt+caption 필수(접근성), Supabase Storage URL.
- 블록 컴포넌트: `heading·paragraph·lecture-summary·student-detail·instructor-note·equation·figure·code·code-output`. `video·animation·interactive-demo·quiz`는 MVP0에서 **자리표시 stub**(타입 보존, 렌더 후순위).

### 4.8 인증 (최소)
- Supabase Auth(email) 로그인 최소 UI. 미들웨어로 세션. `course_members.role` 기반 게이팅.
- 시드: author 1, student 1 (+admin seed). RLS 활성(§15.2): private course=enrolled read, public=guest read, instructor-note=서버 strip.

---

## 5. Loop 1 구현 팬아웃 (Sonnet 5)

| 단계 | Agent | 경로(소유) | 산출 |
|------|-------|-----------|------|
| S1 (배리어) | Scaffold | 루트 config, `app/layout`, `app/globals.css`, `tailwind.config`, `lib/supabase`, **전 의존성 설치** | 빌드 가능한 스켈레톤 + 디자인 토큰 + 레일 |
| S1 (배리어) | Backend files | `supabase/migrations/*`, `supabase/seed.sql` | 7테이블 + RLS + seed SQL (파일) |
| — (메인) | Supabase 기동 | — | `npx supabase start` + `db reset` (Docker 이미지 pull, 수 분) |
| S2 (병렬) | Content Engine | `lib/content/**` + 유닛테스트 | myst 파싱→stable ID→hash→block index |
| S2 (병렬) | Auth | `app/(auth)/**`, `lib/auth/**` | 로그인·세션·role 게이팅 |
| S3 (병렬) | Reading Renderer | `components/blocks/**`, `lib/render/**` | 블록 컴포넌트 + 권한 필터 + KaTeX/Shiki |
| S4 (병렬) | Reading Page | `app/reading/**` | 레일/TOC/본문/우패널, 반응형 |
| S4 (병렬) | Authoring | `app/authoring/**` | CodeMirror+프리뷰+저장+inspector |
| S4 (병렬) | Landing+Seed | `app/(marketing)/**`, `supabase/seed/*.md` | 히어로 + 시드 콘텐츠 |

의존: S2는 S1 이후, S3는 Content Engine 이후, S4는 Renderer 이후. Workflow가 배리어/파이프라인으로 강제.

---

## 6. 검증 게이트 (Fable 5)

1. `tsc --noEmit` · `eslint` · `prettier --check` 통과
2. `next build` 성공 + `next dev` 기동
3. `npx supabase start` + 마이그레이션/seed 정상
4. **Playwright 구동**: 로그인 → Reading에서 시드 챕터 읽힘(수식/코드/이미지) → Authoring에서 편집·저장 → 재로드 시 반영
5. **PRD AC 대조**: §7.4(Reading), §17 MVP0 성공기준, §23-1~4
6. **불변식 회귀 테스트**
   - **A (보안)**: 학생 세션 API/DOM에 `instructor-note` 원문 부재 (Vitest API + Playwright DOM)
   - **B (데이터)**: 블록 편집 전후 `block_id` 동일, 내용 수정 시 `content_hash`만 변경
   - **C (접근성)**: 모든 `figure`에 alt 존재

실패 → 결함 리스트 → Sonnet 5 수정 → 재검증(≤3). 통과 → 커밋 → 보고·승인 대기.

---

## 7. 리스크 & 대응

| 리스크 | 대응 |
|--------|------|
| annotation 위치 어긋남(§19.1) | Block stable ID + block-normalized 좌표 + content_hash drift 경고 (Loop 2) |
| AI 산출물 부정확(§19.2) | draft-only + Author 승인 + provenance + 과학 그림은 코드 렌더 우선 (Loop 3) |
| 코드 실행 보안(§19.3) | Docker sandbox·non-root·network off·timeout/mem·audit log (Loop 4, 정책 선확정) |
| 저작 UX 복잡도(§19.4) | MVP0 Markdown 중심, inspector 최소 |
| Supabase 역할 과부하(§19.5) | Supabase=DB/Auth/Storage/Realtime, 무거운 실행은 Execution Layer 분리 |
| **mystmd ESM ↔ Next 15** | 파싱은 서버(RSC/route handler)에서, 필요 시 `transpilePackages`. 커스텀 directive는 `myst-directives` 플러그인 |
| **병렬 subagent 파일 충돌** | S1이 공유 파일·전 의존성 선점, 이후 agent는 disjoint 하위트리만 |
| **Supabase 로컬 첫 기동 지연** | Docker 이미지 pull 수 분 — 검증 타임아웃 여유, 백그라운드 기동 |

---

## 8. 남은 열린 이슈 (티어에서 결정 — PRD §20)
#1 제품명(→ Lecture Studio 잠정) · #2 소스 오브 트루스(→ Supabase 확정) · #3 파서(→ mystmd 확정) · #4 annotation tldraw/커스텀(Loop 2) · #5 코드실행 정책(Loop 4) · #6 런타임 패키지매니저(Loop 4) · #7 Git 통합(후순위) · #8 PDF/ePub export(MVP4) · #9 iPad Safari annotation(Loop 2 검증) · #10 다학기 재사용(후순위)

---

## 8.5 Loop 2 (MVP 1) 확정 설계 — 2026-07-07 착수

- **결정(Open Issue #4)**: annotation은 **커스텀 SVG 레이어** — pointer events로 stroke 캡처 → 블록 bbox로 segment 분할 → 0~1 정규화 좌표 저장 → 블록별 `<svg>` 오버레이 렌더. 의존성 추가 없음.
- **DB(마이그레이션 0002)**: `lecture_sessions`(status active|ended, published bool) + `annotations`(PRD §8.6 스키마: block_id 앵커, coord_space=block_normalized, created_against_hash, data/style jsonb). RLS: 세션·판서 쓰기=instructor/author/admin, 학생 읽기=**published 세션만**.
- **Lecture Mode** `/lecture/[course]/[chapter]`: 전체화면 스테이지, 접이식 TOC, 우측 instructor-note 패널, 툴바(펜·형광펜·텍스트·지우개·레이저 / 색 3종 / 전체지우기 / 세션 시작·종료 / 공개 / PDF / 종료). 레이저는 비영속(로컬 표시만).
- **복원력**: 판서 로컬 버퍼 우선 저장 → 백그라운드 sync(재시도) → 실패 시 명시 표시. PDF fallback = print CSS + `window.print()`(네이티브).
- **Reading 통합**: 세션 셀렉터 실동작(공개 세션만, 기본=최신), read-only 오버레이, drift 배지.
- **Drift(§8.8)**: annotation의 created_against_hash ≠ 현재 block hash → "내용 변경됨" 경고 표시 + 유지/폐기 선택. 조용한 렌더/삭제 금지.
- **MVP0 이월**: video/animation 블록 실렌더(stub 해제), 시드에 figure(alt 포함)+video 블록 추가 → 불변식 C 비-공허화.
- **검증 불변식(Loop 2)**: A′ 미공개 세션 판서가 학생 DOM/REST에 부재 · B′ 뷰포트 리사이즈/reflow 후에도 판서가 자기 블록 bbox 안에 정렬 · C′ 공개/최신 기본/셀렉터 전환 동작 · D′ 블록 수정 시 drift 경고 표시(조용한 렌더 금지) · E′ 저장 실패 시 사용자 표시(네트워크 차단 시뮬레이션) · F′ MVP0 불변식 회귀 유지.

## 9. 지금 실행할 것
1. 본 문서 확정(= Fable 5 계획 산출물)
2. Loop 1 Workflow 실행: S1 스캐폴드 → Supabase 기동 → S2~S4 병렬 구현 → Fable 5 검증 → (실패 시 수정 ≤3) → 커밋
3. **MVP 0 검증 통과 후 정지 → 결과 보고 → Loop 2(Lecture Mode) 착수 승인 요청**
