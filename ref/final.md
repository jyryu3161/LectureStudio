# 강의형 전자책 플랫폼 PRD 최종 검토본 v1.0

**제품 가칭:** Lecture Studio / AI Lecture Book Studio / Hermes Lecture Studio  
**작성 목적:** 강의자료 저작, 전자책 배포, 강의자 판서, AI 저작 보조, 강의별 실행환경을 하나의 플랫폼에서 제공하기 위한 제품 요구사항 정의  
**권장 스택:** Next.js, Supabase, Docker Execution Worker, MyST Markdown, Block-based Annotation  
**최종 검토 방향:** D2L.ai는 UI/UX 참고 사례로만 사용하며, 학생용 AI Tutor/RAG는 MVP 범위에서 제외한다. AI는 학생 응답보다 **강의자료 제작 보조**에 우선 적용한다.

---

## 1. Executive Summary

본 제품은 단순 전자책 플랫폼이 아니라, **전자책을 그대로 강의자료로 사용할 수 있는 AI-assisted interactive lecture book platform**이다.

교수자 또는 강의자는 하나의 원본 콘텐츠를 작성하고, 이를 다음 용도로 동시에 활용한다.

- 학생용 전자책
- 강의자용 Lecture Mode
- 강의 중 annotation 및 판서 저장
- 영상, GIF, 수식, 코드, interactive demo가 포함된 강의 콘텐츠
- 강의별 독립 Python/Docker 실행환경
- AI 기반 강의자료 초안, 설명문, 그림, 퀴즈, 코드 설명 생성

MVP의 핵심은 복잡한 슬라이드 변환이나 학생용 AI Tutor가 아니라, 다음 세 가지다.

1. **깔끔한 전자책 저작·읽기 루프**
2. **전자책 위에 직접 판서하는 Live Book Lecture Mode**
3. **AI를 통한 강의자료 제작 효율화**

코드 실행과 Marimo interactive demo는 중요하지만, 보안과 운영 복잡도가 높기 때문에 AI Authoring 이후 단계로 둔다.

---

## 2. 제품 비전

### 2.1 한 줄 정의

**강의자가 하나의 전자책 원본으로 강의자료, 실습자료, 판서자료, 복습자료를 모두 운영할 수 있는 AI-native 강의형 전자책 플랫폼**

### 2.2 해결하려는 문제

현재 강의자료 제작은 여러 도구로 분산되어 있다.

- 전자책 또는 PDF 교재
- PPT 강의자료
- Jupyter Notebook 또는 Colab 실습
- 이미지, GIF, 영상 자료
- 과제와 퀴즈
- 수업 중 판서
- 학생 복습자료
- 학기별 업데이트 버전

이 때문에 교수자는 같은 내용을 여러 번 재작성하고, 학생은 읽기와 실습을 다른 환경에서 수행해야 한다. 또한 강의 중 판서가 체계적으로 저장되지 않아 수업 후 복습자료로 재사용하기 어렵다.

본 플랫폼은 이 문제를 **One Source, Multiple Modes** 방식으로 해결한다.

```text
하나의 강의 원본
  ├─ 학생용 Reading Mode
  ├─ 강의자용 Lecture Mode
  ├─ AI 저작 보조
  ├─ 판서/annotation archive
  ├─ 실행형 코드/interactive demo
  └─ PDF/ePub/export
```

---

## 3. 제품 방향

### 3.1 D2L.ai는 스타일 참고 사례

D2L.ai는 본 플랫폼의 복제 대상이 아니다. 참고할 부분은 **깔끔한 실행형 전자책 UX**이다.

참고할 요소는 다음이다.

- 좌측 목차 기반 탐색
- 본문 중심의 읽기 경험
- 수식, 코드, 그림, 표, 설명이 자연스럽게 배치되는 구조
- 코드와 설명이 함께 제공되는 학습 흐름
- 노트북 또는 실행환경으로 연결 가능한 구조
- 학생이 혼자 읽어도 이해할 수 있는 설명 밀도

본 플랫폼의 차별점은 다음이다.

- 전자책 자체를 강의자료로 사용하는 Lecture Mode
- 강의 중 전자책 위 직접 annotation
- annotation의 강의 세션별 저장과 재사용
- 강의별 독립 Docker/Python 실행환경
- Admin의 패키지 설치와 runtime 관리
- AI 기반 강의자료 제작 보조
- AI 기반 개념 그림, 도식, GIF 생성
- 학생용 interactive visualization viewer

### 3.2 학생용 AI Tutor/RAG는 MVP 제외

학생이 현재 페이지에 대해 AI에게 질문하는 기능은 장기적으로 유용할 수 있으나, MVP의 핵심 가치는 아니다. 초기 제품에서는 학생용 AI Tutor/RAG를 제외하고, AI 기능을 **Authoring Assistant**에 집중한다.

즉, AI의 1차 사용자는 학생이 아니라 **강의자료 제작자**이다.

### 3.3 최종 제품 철학

제품의 핵심 철학은 다음이다.

```text
전자책을 만들면 강의자료가 되고,
강의 중 판서가 남고,
강의 후 복습자료가 되며,
AI가 다음 버전의 자료 제작을 도와준다.
```

---

## 4. 사용자와 권한

### 4.1 Admin

플랫폼 전체 또는 강의 환경을 관리한다.

주요 권한:

- 사용자와 권한 관리
- Course 생성 및 삭제
- 강의별 runtime 관리
- 패키지 설치 UI 사용
- Docker image build 및 배포
- AI API key와 secret 관리
- Storage, DB, backup 관리

### 4.2 Author

강의자료를 작성하는 교수자 또는 조교이다.

주요 권한:

- Chapter 작성과 수정
- MyST Markdown 또는 block editor 사용
- 이미지, GIF, 영상, 수식, 코드 삽입
- AI Authoring Assistant 사용
- AI 생성물 승인 또는 폐기
- Quiz 후보 검토와 공개
- Course 버전 발행

### 4.3 Instructor

실제 수업에서 Lecture Mode를 사용하는 강의자이다.

주요 권한:

- Lecture Mode 실행
- 판서와 annotation 작성
- 강의 세션 생성과 종료
- annotation 공개 또는 비공개 설정
- instructor-note 확인
- 강의 후 판서 재사용

### 4.4 Student

수강생이다.

주요 권한:

- Reading Mode로 전자책 보기
- 공개된 annotation 보기
- 영상, GIF, 수식, 코드 결과 확인
- 허용된 interactive demo 조작
- 퀴즈 풀기
- 개인 메모 작성

### 4.5 Guest

공개 강의를 보는 비로그인 사용자이다.

주요 권한:

- 공개 Course 읽기
- 공개 asset 보기
- 코드 실행, 개인 메모, 비공개 annotation 접근은 제한

---

## 5. 핵심 데이터 계층

### 5.1 Canonical hierarchy

데이터 계층은 다음 세 단계로 고정한다.

```text
Course
 └─ Chapter
     └─ Block
```

정의:

- **Course:** 강의 또는 전자책 1권
- **Chapter:** 장 단위 콘텐츠
- **Block:** 콘텐츠 최소 저장·렌더·annotation 단위

중요한 원칙:

- page는 데이터 모델이 아니라 렌더링 또는 스크롤 표현일 뿐이다.
- section은 별도 데이터 계층으로 만들지 않는다.
- 장 내부 구분은 heading Block으로 표현한다.
- annotation, AI 산출물, asset, 코드 실행 결과는 모두 가능하면 Block에 연결한다.

### 5.2 Block 정의

Block은 콘텐츠의 최소 단위이다. 최상위 Markdown 요소 하나가 하나의 Block에 대응한다.

예:

- 제목
- 문단
- 수식
- 그림
- GIF/animation
- 코드 블록
- 코드 출력
- 영상
- interactive demo
- instructor note
- quiz

### 5.3 Block stable ID 정책

모든 Block은 생성 시 stable ID를 가진다.

필수 원칙:

- Block ID는 UUID 또는 랜덤 기반으로 생성한다.
- Block ID는 내용, 위치, 순서에 의존하지 않는다.
- Block이 이동되거나 순서가 바뀌어도 ID는 유지된다.
- Block 내용이 수정되면 ID는 유지하고 `content_hash`만 갱신한다.
- Block ID는 원본 Markdown에도 저장되어야 한다.
- 렌더 결과 HTML에도 `data-block-id`와 `data-content-hash`가 포함되어야 한다.

렌더 예시:

```html
<section data-block-id="blk_9f2a" data-content-hash="a1b2c3">
  ...
</section>
```

이 정책은 MVP 0부터 구현해야 한다. 나중에 Focus Lecture Mode 또는 annotation 재사용을 붙이려면, 초기 콘텐츠부터 stable ID가 있어야 한다.

### 5.4 저작 포맷

권장 포맷은 **MyST Markdown-compatible source**이다.

이유:

- 수식, directive, code, admonition, figure 표현이 강력하다.
- Jupyter Book, Quarto, VS Code 확장 등 외부 생태계와 연결 가능성이 있다.
- 완전한 자체 문법을 새로 만드는 것보다 유지보수 부담이 낮다.

단, 플랫폼 내부에서는 MyST 원본을 그대로만 쓰지 않고, 파싱된 Block index를 DB에 저장한다.

```text
MyST source file
  ↓ parse
Block AST / Block index
  ↓ render
Reading Mode / Lecture Mode / Export
```

### 5.5 Block 타입

필수 Block 타입은 다음이다.

- `heading`: 제목. 학생에게 노출된다. Chapter 내부 heading도 이 타입으로 표현한다.
- `paragraph`: 일반 본문. 학생용 설명에 사용한다.
- `lecture-summary`: 핵심 요약. 학생에게 노출되며 Lecture Mode에서 강조 표시한다.
- `student-detail`: 학생용 상세 설명. 학생에게 노출되지만 Lecture Mode에서는 접을 수 있다.
- `instructor-note`: 강의자 노트. 학생에게 노출되지 않으며 서버 단계에서 접근 제어한다.
- `equation`: LaTeX 수식. KaTeX 또는 MathJax로 렌더링한다.
- `figure`: 정적 그림. caption과 alt text를 필수로 가진다.
- `animation`: GIF 또는 단계별 도식. 가능하면 코드 렌더링 기반으로 생성한다.
- `video`: 업로드 영상 또는 embed 영상.
- `code`: 코드 예제. 실행 가능 여부는 Author 승인 후 별도 metadata로 지정한다.
- `code-output`: 코드 실행 결과 또는 정적 결과.
- `interactive-demo`: Marimo 등 interactive demo. MVP 후순위 기능이다.
- `quiz`: 체크 질문. Author 승인 후 학생에게 공개한다.

### 5.6 접근 제어

`instructor-note`는 매우 중요하다. 이 Block은 학생에게 절대 노출되면 안 된다.

정책:

- Author, Instructor, Admin만 볼 수 있다.
- 학생 Reading Mode 응답에 포함되지 않는다.
- 학생 Lecture Replay 응답에 포함되지 않는다.
- PDF/ePub export에도 포함되지 않는다.
- CSS로 숨기는 방식은 금지한다.
- 서버 렌더링 단계에서 제거해야 한다.

Acceptance Criteria:

- 학생 계정으로 요청한 어떤 API 응답에도 instructor-note 원문이 포함되지 않는다.
- 브라우저 DOM에도 instructor-note가 존재하지 않는다.

---

## 6. 콘텐츠 저작 UX

### 6.1 저작 방식

MVP에서는 두 가지 저작 방식을 병행한다.

1. **Markdown/MyST Editor**
   - 고급 사용자와 교수자에게 적합
   - Git 친화적
   - 빠른 작성 가능

2. **Block Inspector / Block Controls**
   - Block 타입 변경
   - 학생 노출 여부 확인
   - Lecture Mode 표시 옵션 설정
   - AI 생성물 삽입
   - asset 연결

WYSIWYG 전체 편집기는 장기적으로 고려하되, MVP에서는 Markdown 기반을 우선한다.

### 6.2 콘텐츠 작성 패턴

강의형 전자책은 단순한 긴 글이 아니라, 강의와 독학을 모두 고려해 작성되어야 한다.

권장 구조:

```text
1. 핵심 요약
2. 학생용 자세한 설명
3. 강의자 노트
4. 그림 또는 도식
5. 수식
6. 코드 예제
7. 코드 결과
8. interactive demo
9. 체크 질문
```

예시:

```markdown
## Dropout

:::lecture-summary
Dropout은 학습 중 일부 뉴런을 무작위로 제거하여 과적합을 줄이는 정규화 기법이다.
:::

:::student-detail
신경망은 학습 데이터에 지나치게 잘 맞춰질 경우 새로운 데이터에서 성능이 떨어질 수 있다.
이를 과적합이라고 한다.
:::

:::instructor-note
여기서 학생들에게 "일부러 뉴런을 끄면 왜 성능이 좋아질까?"라고 질문한다.
:::

:::equation
$$ h' = m \odot h, \quad m_i \sim \mathrm{Bernoulli}(p) $$
:::
```

---

## 7. Reading Mode

### 7.1 목적

학생이 전자책처럼 강의자료를 읽고, 필요 시 코드 결과와 interactive demo를 확인하는 모드이다.

### 7.2 UI 구성

```text
좌측: Course 목차
중앙: 본문
우측: 현재 Chapter 목차 / 관련 asset / 메모
상단: 검색, PDF, Notebook, annotation 보기
```

### 7.3 필수 기능

- 반응형 전자책 UI
- 좌측 목차
- 현재 위치 표시
- 수식 렌더링
- 코드 하이라이팅
- 코드 접기/펼치기
- 이미지 확대
- GIF/animation 재생
- 영상 재생
- 공개 annotation overlay 보기
- 세션별 annotation 선택
- 개인 메모
- 북마크
- 검색

### 7.4 Acceptance Criteria

- 학생은 모바일, 태블릿, 데스크톱에서 콘텐츠를 읽을 수 있다.
- 코드와 출력 결과를 구분해서 볼 수 있다.
- 공개된 lecture annotation을 선택적으로 표시할 수 있다.
- 여러 공개 세션이 있을 경우 기본값은 가장 최근 세션이다.

---

## 8. Lecture Mode

### 8.1 목적

강의자가 별도 PPT를 만들지 않고, 전자책 콘텐츠를 그대로 강의자료로 사용한다.

Lecture Mode는 전자책을 슬라이드로 변환하는 기능이 아니라, **전자책 위에 강의 도구를 얹는 모드**이다.

### 8.2 MVP 기본안: Live Book Lecture Mode

MVP에서는 Live Book Lecture Mode를 기본으로 한다.

```text
Reading View
  + Fullscreen Presentation UI
  + Annotation Layer
  + Instructor Toolbar
```

특징:

- 전자책 페이지를 그대로 전체화면으로 표시한다.
- 목차와 사이드바는 접을 수 있다.
- 강의자는 본문 위에 직접 판서한다.
- annotation은 Block 단위로 저장된다.
- 별도 slide 변환은 하지 않는다.

### 8.3 Lecture Mode 유형

#### 8.3.1 Live Book Mode

MVP 기본 모드이다.

장점:

- 원본 전자책과 강의자료가 동일하다.
- 별도 변환이 없다.
- 학생이 나중에 같은 위치에서 판서를 볼 수 있다.
- 구현 리스크가 가장 낮다.

단점:

- 긴 본문은 강의 화면에서 복잡할 수 있다.
- annotation 좌표와 reflow 처리가 중요하다.

#### 8.3.2 Focus Mode

후순위 고도화 기능이다.

전자책의 Block을 하나씩 확대해서 보여준다.

```text
lecture-summary
  → equation
  → figure
  → code
  → interactive-demo
```

Focus Mode는 슬라이드 변환이 아니라 **Block focus viewer**이다. 원본 콘텐츠를 유지하면서 강의 화면을 더 깔끔하게 만드는 방식이다.

#### 8.3.3 Generated Slide Mode

장기 선택 기능이다.

전자책 내용을 요약해 별도 슬라이드를 생성한다. MVP 범위에는 포함하지 않는다.

### 8.4 Lecture Mode UI

```text
상단 toolbar:
  Pen | Highlighter | Text | Eraser | Laser Pointer
  Save | Publish | Export PDF | Exit

좌측:
  Chapter 목차 / 현재 위치 / 이전·다음 이동

중앙:
  전자책 본문
  수식·그림·코드·영상·GIF·interactive demo
  annotation overlay

우측:
  instructor-note
  현재 Block 정보
  다음 설명 포인트
```

### 8.5 콘텐츠 표시 정책

Reading Mode와 Lecture Mode는 같은 원본 콘텐츠를 사용한다. 다만 Lecture Mode에서는 표시 옵션을 제공한다.

- student-detail 보기/숨기기
- 코드 보기/숨기기
- 코드 출력만 보기
- 그림 크게 보기
- 수식 크게 보기
- 영상 전체화면 보기
- interactive demo 크게 보기
- 강의자 노트 표시

### 8.6 Annotation 앵커링 원칙

annotation은 page나 viewport가 아니라 **Block**에 붙인다.

핵심 원칙:

- anchor는 `block_id`이다.
- 좌표는 해당 Block bounding box 기준 0~1 정규화 좌표이다.
- `scroll_position`과 `viewport_size`는 저장하지 않는다.
- 렌더 시 현재 Block 위치를 찾고, 정규화 좌표를 현재 bounding box에 매핑한다.
- Block이 이동하거나 reflow되어도 annotation이 Block을 따라간다.

데이터 예시:

```json
{
  "id": "anno_7c1e",
  "course_id": "course_ml101",
  "course_version_id": "v3",
  "chapter_id": "ch_dropout",
  "block_id": "blk_9f2a",
  "created_against_hash": "a1b2c3",
  "lecture_session_id": "week_05_2026",
  "type": "pen",
  "coord_space": "block_normalized",
  "points": [
    { "x": 0.21, "y": 0.31 },
    { "x": 0.22, "y": 0.32 }
  ],
  "style": {
    "color": "#e11",
    "width": 3
  }
}
```

### 8.7 여러 Block을 가로지르는 판서

실제 판서는 여러 Block을 가로지를 수 있다. MVP에서는 다음 정책을 적용한다.

- stroke가 하나의 Block 안에 있으면 해당 Block에 저장한다.
- stroke가 여러 Block을 지나가면 Block별 segment로 나누어 저장한다.
- 여백이나 gutter에 그린 stroke는 가장 가까운 Block에 귀속한다.
- 장기적으로는 chapter-level overlay를 보조적으로 둘 수 있다.

### 8.8 버전 드리프트 정책

annotation 생성 시점의 Block `content_hash`를 함께 저장한다.

신버전 렌더링 시 정책:

- hash 일치: 정상 렌더
- hash 불일치: “내용 변경됨” 경고 표시
- 강의자는 유지, 폐기, 재배치를 선택할 수 있다.
- 잘못된 위치에 조용히 렌더링하지 않는다.
- 조용히 삭제하지 않는다.

Author가 새 버전을 발행할 때, 영향을 받는 annotation 목록을 보여준다.

### 8.9 세션 공개 정책

annotation은 강의 세션 단위로 저장한다.

정책:

- 강의 종료 후 세션을 공개 또는 비공개로 설정한다.
- 학생은 공개된 세션만 볼 수 있다.
- 여러 세션이 공개된 경우 기본값은 가장 최근 세션이다.
- 여러 세션을 동시에 겹쳐 표시하지 않는다.
- 학생은 세션 드롭다운으로 다른 공개 세션을 선택할 수 있다.

### 8.10 장애 대응

Lecture Mode는 실시간 강의 도구이므로 장애 대응이 중요하다.

필수 정책:

- annotation은 로컬 버퍼에 우선 저장한다.
- 네트워크가 끊겨도 현재 Chapter 판서는 계속 가능해야 한다.
- 네트워크 복구 시 자동 동기화한다.
- 저장 실패 시 사용자에게 명확히 표시한다.
- toolbar에 “현재 화면 PDF 내보내기”를 항상 제공한다.
- annotation 도구가 실패해도 PDF fallback으로 강의를 이어갈 수 있어야 한다.

### 8.11 Acceptance Criteria

- 강의자는 전자책 페이지에서 버튼 하나로 Lecture Mode에 진입할 수 있다.
- Lecture Mode에서 전자책 위에 직접 annotation할 수 있다.
- annotation은 Block 정규화 좌표로 저장된다.
- 화면비, 스크롤, reflow 변화에도 annotation이 해당 Block과 정렬된다.
- annotation은 강의 세션별로 저장된다.
- Block 내용이 변경되면 drift 경고가 표시된다.
- 학생은 공개된 annotation을 Reading Mode에서 재열람할 수 있다.
- 현재 화면 PDF export fallback이 항상 가능하다.

---

## 9. AI Authoring Assistant

### 9.1 목적

AI Authoring Assistant는 학생용 챗봇이 아니라, **강의자료 제작자를 위한 AI Copilot**이다.

강의자는 AI를 활용해 다음을 빠르게 만든다.

- chapter outline
- 학생용 설명문
- 강의자용 요약
- 핵심 개념 박스
- 수식 설명
- 코드 설명
- 개념 그림
- 도식
- GIF/animation 명세
- quiz 후보

### 9.2 공통 원칙

모든 AI 산출물에는 다음 원칙을 적용한다.

#### Draft-only

AI 생성물은 항상 draft 상태로 생성된다. Author 승인 전에는 학생에게 노출되지 않는다.

#### Provenance 필수

모든 AI 생성물은 provenance metadata를 가진다.

필수 metadata:

- 생성 타입
- 생성 모델
- prompt 또는 입력 문맥
- 생성 날짜
- 생성자
- 대상 course/chapter/block
- 승인 상태
- 수정 이력

#### Human approval gate

- 설명문은 Author 승인 후 반영한다.
- 그림은 Author 확인 후 삽입한다.
- 코드는 Author 검토 후 executable 여부를 부여한다.
- quiz는 Author 승인 후 공개한다.

#### 정확성 우선

과학적·수학적 정확성이 중요한 그림이나 animation은 생성형 이미지 모델보다 결정론적 코드 렌더링을 우선한다.

### 9.3 MVP 기능

MVP 2에서 제공할 기능은 다음이다.

#### 1. 강의 초안 생성

입력:

```text
주제: Dropout
대상: 학부 3학년 생명정보학 수강생
목표: 과적합 방지 개념과 PyTorch 구현 이해
분량: 전자책 3~5페이지
포함 요소: 개념 설명, 수식, 코드, 그림 아이디어, 실습 문제
```

출력:

- chapter outline
- 학생용 설명문 초안
- 강의자용 요약
- 핵심 개념 박스
- 수식 설명
- 코드 예제 후보
- 그림 생성 명세
- interactive demo 아이디어
- quiz 후보

#### 2. 학생용 설명 보강

짧은 강의 메모를 학생이 읽을 수 있는 전자책 문장으로 확장한다.

#### 3. 강의자용 요약 생성

긴 본문을 Lecture Mode에서 사용할 핵심 bullet로 요약한다.

#### 4. 개념 그림 생성

강의자가 자연어로 요청하면 AI가 그림 생성 명세 또는 렌더링 코드를 만든다.

#### 5. 코드 설명 생성

이미 작성된 코드를 학생용으로 설명한다.

지원 방식:

- 전체 코드 설명
- line-by-line 설명
- 함수별 설명
- 예상 출력 설명
- 흔한 오류 설명

#### 6. Quiz 후보 생성

AI가 quiz 후보를 생성한다. 단, Author 승인 전에는 공개되지 않는다.

지원 유형:

- 객관식
- OX
- 단답형
- 코드 빈칸 채우기
- 개념 설명형
- 실습형

### 9.4 그림·GIF 생성 전략

그림 생성은 두 경로로 나눈다.

#### 경로 A: 결정론적 코드 렌더링

기본 경로이다.

대상:

- 수식 플롯
- 알고리즘 단계
- neural network 구조
- dropout 적용 전후
- gradient descent 과정
- PCA 축 회전
- FBA flux 변화
- 데이터 시각화

방식:

- matplotlib
- plotly
- graphviz
- manim
- matplotlib.animation

장점:

- 재현 가능하다.
- seed 고정이 가능하다.
- 코드로 검토할 수 있다.
- 과학적 정확성을 확인하기 쉽다.
- 수정과 재렌더링이 쉽다.

#### 경로 B: 생성형 이미지 모델

보조 경로이다.

대상:

- 표지 이미지
- 은유적 삽화
- 개념적 배경 그림
- 비기술적 illustration

정책:

- 과학적 정확성이 핵심인 도식에는 기본 사용하지 않는다.
- 사용 시 반드시 Author 검토를 거친다.

### 9.5 AI 산출물 데이터

AI 산출물은 별도 테이블 또는 asset metadata에 저장한다.

필드 예시:

```json
{
  "id": "ai_artifact_123",
  "course_id": "course_ml101",
  "chapter_id": "ch_dropout",
  "block_id": "blk_9f2a",
  "artifact_type": "figure_code",
  "status": "draft",
  "model": "selected_model_name",
  "prompt": "Dropout concept diagram...",
  "source_context": "...",
  "output": "...",
  "approved_by": null,
  "created_at": "2026-07-07T10:00:00+09:00"
}
```

### 9.6 제외 범위

MVP에서는 다음을 제외한다.

- 학생용 AI Tutor
- RAG 기반 학생 질의응답
- 학생 질문 자동 답변
- 실시간 오답 코칭

장기 확장 후보로는 유지한다.

---

## 10. Runtime Environment Management

### 10.1 목적

강의마다 필요한 Python 패키지와 실행환경이 다르므로, Course별 독립 runtime을 제공한다.

예:

```text
Python 기초:
  numpy, pandas, matplotlib

AI 신약개발:
  rdkit, torch, scikit-learn, py3Dmol

대사모델링:
  cobra, cameo, escher, optlang

생물정보학:
  biopython, scanpy, anndata, gseapy
```

### 10.2 핵심 원칙

Admin UI는 RStudio처럼 쉽게 패키지를 설치하는 경험을 제공하되, 실제 배포 단위는 Docker image로 고정한다.

권장 흐름:

```text
Admin이 패키지 추가
  ↓
environment.yml 또는 runtime config 업데이트
  ↓
Docker image build
  ↓
import test 실행
  ↓
sample code 실행
  ↓
Runtime 배포
```

### 10.3 Runtime config 예시

```yaml
runtime:
  id: ai-drug-discovery-py311
  type: docker
  base_image: mambaorg/micromamba
  python: "3.11"
  gpu: false
  memory_limit: "4g"
  timeout_seconds: 60
  network: false

packages:
  conda:
    - rdkit
    - numpy
    - pandas
    - scikit-learn
  pip:
    - mols2grid
    - py3Dmol
  apt:
    - graphviz
```

### 10.4 Admin Runtime Studio

필수 기능:

- Python 버전 선택
- Conda 패키지 추가
- Pip 패키지 추가
- System package 추가
- GPU 사용 여부 설정
- memory/time limit 설정
- Dockerfile preview
- Docker build 실행
- build log 확인
- import test
- sample execution test
- runtime version 배포
- rollback

### 10.5 보안 전제

코드 실행은 임의 코드 실행 위험을 가진다. MVP 3 착수 전에 다음을 확정해야 한다.

- 학생 실행을 허용할 것인지
- Author만 실행 가능하게 할 것인지
- 네트워크 접근 허용 여부
- CPU, memory, timeout 제한
- 파일 시스템 접근 범위
- 실행 결과 저장 여부
- 동시 실행 한도
- 컨테이너 격리 수준

이 보안 정책이 확정되기 전에는 학생 코드 실행을 production에 배포하지 않는다.

---

## 11. Code Execution

### 11.1 실행 모드

코드 실행은 세 단계로 나눈다.

#### Browser Runtime

간단한 코드만 브라우저에서 실행한다.

대상:

- Python 기초
- numpy 일부
- pandas 일부
- matplotlib 기초
- 간단한 ML toy example

#### Server Runtime

패키지가 복잡하거나 계산량이 있는 코드는 Docker worker에서 실행한다.

대상:

- RDKit
- COBRApy
- PyTorch
- Scanpy
- Biopython

#### GPU Runtime

GPU가 필요한 강의는 별도 GPU worker에서 실행한다.

대상:

- deep learning training
- protein embedding
- large model inference

### 11.2 실행 정책

필수 정책:

- timeout
- memory limit
- CPU limit
- network off by default
- non-root user
- temporary working directory
- read-only base image
- execution audit log
- package install 제한

### 11.3 Acceptance Criteria

- 학생 또는 Author는 허용된 code block에서 Run을 실행할 수 있다.
- 실행 결과는 본문 안에 표시된다.
- 오류 메시지는 이해 가능한 형태로 표시된다.
- timeout과 memory limit이 강제된다.
- 실행 로그가 저장된다.

---

## 12. Interactive Visualization

### 12.1 목적

학생이 코드를 직접 수정하지 않아도 parameter를 조작하며 개념을 이해할 수 있게 한다.

### 12.2 기능

- slider
- dropdown
- checkbox
- table
- plot
- 3D viewer
- molecule viewer
- network viewer
- pathway viewer

### 12.3 Marimo 활용

Marimo는 interactive demo를 만들기에 적합하다. MVP 4에서 Marimo app 등록과 embed를 제공한다.

예:

- dropout rate 조절
- PCA component 수 조절
- K-means cluster 수 조절
- FBA gene knockout 선택
- drug response curve fitting

### 12.4 Acceptance Criteria

- 학생은 viewer 안에서 demo를 조작할 수 있다.
- 코드를 보지 않아도 결과가 변하는 것을 확인할 수 있다.
- 무거운 계산은 server runtime 또는 async job으로 처리된다.

---

## 13. Technical Architecture

### 13.1 권장 전체 구조

```text
Browser
  ├─ Reading Mode
  ├─ Lecture Mode
  ├─ Authoring Studio
  └─ Admin Runtime Studio

Next.js App
  ├─ Frontend UI
  ├─ Route Handlers
  ├─ Content Renderer
  ├─ Annotation API
  ├─ AI Authoring API Orchestration
  └─ Execution Job Client

Supabase
  ├─ Postgres
  ├─ Auth
  ├─ Storage
  ├─ Realtime
  └─ RLS

Execution Layer
  ├─ Queue
  ├─ Docker Build Worker
  ├─ Code Execution Worker
  ├─ Marimo App Runner
  └─ GPU Worker optional
```

### 13.2 Next.js 역할

- 학생 Reading Mode
- 강의자 Lecture Mode
- Admin UI
- Authoring UI
- API orchestration
- SSR/permission-aware rendering
- instructor-note 서버 필터링
- annotation overlay UI

### 13.3 Supabase 역할

- Auth
- Postgres metadata
- Row Level Security
- Storage for assets
- Realtime for annotation sync/status
- Edge Functions for lightweight jobs

Supabase가 담당하지 않는 것:

- 장시간 Docker build
- GPU job
- 무거운 코드 실행
- 대용량 scientific computation

이 작업은 Execution Layer에서 담당한다.

### 13.4 Content Engine

권장 구조:

```text
MyST Markdown source
  ↓
Parser
  ↓
Block AST + stable IDs
  ↓
DB Block index
  ↓
Next.js renderer
```

MVP에서는 Next.js renderer가 학생용 웹 UI를 직접 렌더링한다. Quarto/Jupyter Book export는 중장기 기능으로 둔다.

### 13.5 Content source of truth

권장안:

- 원본 콘텐츠는 Git-compatible MyST Markdown으로 유지한다.
- Supabase에는 metadata와 parsed block index를 저장한다.
- Supabase Storage에는 asset과 export 결과를 저장한다.
- Course release 시점에 version snapshot을 만든다.
- Git integration은 초기에는 optional, 장기적으로는 release history와 연결한다.

---

## 14. 데이터 모델 초안

### 14.1 주요 테이블

```text
users
courses
course_members
course_versions
chapters
content_blocks
assets
ai_artifacts
lecture_sessions
annotations
runtimes
runtime_builds
executions
quizzes
quiz_submissions
```

### 14.2 courses

```sql
courses (
  id uuid primary key,
  title text,
  subtitle text,
  description text,
  owner_id uuid,
  visibility text,
  default_runtime_id uuid,
  current_version_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
```

### 14.3 chapters

```sql
chapters (
  id uuid primary key,
  course_id uuid,
  version_id uuid,
  title text,
  slug text,
  order_index int,
  source_path text,
  created_at timestamptz,
  updated_at timestamptz
)
```

### 14.4 content_blocks

```sql
content_blocks (
  id text primary key,
  course_id uuid,
  chapter_id uuid,
  version_id uuid,
  block_type text,
  order_index int,
  content_hash text,
  visibility text,
  source_range jsonb,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
```

### 14.5 annotations

```sql
annotations (
  id uuid primary key,
  course_id uuid,
  chapter_id uuid,
  block_id text,
  course_version_id uuid,
  lecture_session_id uuid,
  author_id uuid,
  annotation_type text,
  coord_space text,
  created_against_hash text,
  data jsonb,
  style jsonb,
  scope text,
  created_at timestamptz,
  updated_at timestamptz
)
```

### 14.6 ai_artifacts

```sql
ai_artifacts (
  id uuid primary key,
  course_id uuid,
  chapter_id uuid,
  block_id text,
  artifact_type text,
  status text,
  model text,
  prompt text,
  source_context text,
  output jsonb,
  asset_id uuid,
  approved_by uuid,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
```

### 14.7 runtimes

```sql
runtimes (
  id uuid primary key,
  course_id uuid,
  name text,
  python_version text,
  base_image text,
  conda_packages jsonb,
  pip_packages jsonb,
  apt_packages jsonb,
  dockerfile text,
  image_tag text,
  gpu_enabled boolean,
  memory_limit text,
  timeout_seconds int,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
```

---

## 15. Security and Access Control

### 15.1 Role-based access

```text
Admin:
  전체 관리

Author:
  강의자료 작성과 AI 산출물 승인

Instructor:
  Lecture Mode와 annotation 관리

Student:
  수강 강의 읽기와 공개 annotation 보기

Guest:
  공개 콘텐츠 읽기
```

### 15.2 RLS 정책

Supabase RLS를 기본 활성화한다.

정책 예:

- private course는 enrolled user만 read 가능
- public course는 guest read 가능
- instructor-note는 서버 렌더링 단계에서 제거
- private annotation은 author만 read
- session annotation은 공개된 경우 enrolled student read 가능
- execution log는 본인과 admin만 read 가능

### 15.3 instructor-note 보호

instructor-note는 DB/API/rendering 모든 단계에서 보호한다.

금지:

- 클라이언트에서 CSS로 숨기기
- 학생 응답 payload에 포함하기
- export에 실수로 포함하기

---

## 16. Non-functional Requirements

### 16.1 성능

- Chapter 최초 로드: 목표 2초 이내
- Chapter 내부 navigation: 목표 500ms 이내
- annotation pen 입력 반영: 목표 50ms 이내
- annotation 저장: optimistic local save 후 background sync
- lightweight demo update: 목표 3초 이내

### 16.2 복원력

- annotation local buffer
- 네트워크 복구 시 sync
- 저장 실패 알림
- PDF export fallback
- course version snapshot
- runtime rollback

### 16.3 데이터와 백업

- 콘텐츠 version backup
- annotation backup
- asset backup
- runtime config backup
- ai_artifact provenance 보존

### 16.4 접근성

- figure와 animation alt text 필수
- caption 권장
- 수식은 접근성 대응 고려
- 색상만으로 의미를 전달하지 않음
- keyboard navigation 고려

### 16.5 브라우저 지원

MVP에서 지원할 브라우저는 사전에 확정한다.

권장:

- 최신 Chrome
- 최신 Edge
- 최신 Safari
- 최신 Firefox
- iPad Safari는 Lecture Mode annotation 테스트 대상에 포함

---

## 17. MVP Roadmap

### MVP 0: 저작 → 읽기 루프 검증

목표: 전자책 제작과 렌더링 루프를 검증한다.

필수 기능:

- MyST/Markdown editor 최소 버전
- Block stable ID 생성과 보존
- Block parser
- Reading Viewer
- 좌측 목차
- 수식 렌더
- 코드 렌더
- 이미지 렌더
- Supabase Auth/DB/Storage 기본 연결

성공 기준:

- 한 개 Course를 작성하고 학생용 Reading Mode로 볼 수 있다.
- Block ID가 편집 후에도 유지된다.

### MVP 1: Lecture Mode와 annotation

목표: 전자책을 실제 강의자료로 사용할 수 있게 한다.

필수 기능:

- 영상/GIF block 지원
- Live Book Lecture Mode
- Pen/highlighter/text/eraser
- Block 정규화 좌표 저장
- local buffer와 sync
- lecture session 생성과 종료
- annotation 저장/불러오기
- 세션 공개/비공개
- version drift 경고
- PDF export fallback

성공 기준:

- 강의자가 전자책 위에 판서하고 수업 후 학생에게 공개할 수 있다.

### MVP 2: AI Authoring Assistant

목표: 강의자료 제작 효율을 높인다.

필수 기능:

- 강의 초안 생성
- 학생용 설명 보강
- 강의자용 요약 생성
- 개념 그림 생성 또는 그림 생성 코드 생성
- 코드 설명 생성
- quiz 후보 생성
- draft/approval workflow
- provenance metadata 저장

성공 기준:

- Author가 AI 산출물을 검토하고 승인 후 콘텐츠에 삽입할 수 있다.

### MVP 3: Runtime Environment와 코드 실행

목표: 강의별 독립 실행환경을 제공한다.

전제:

- 코드 실행 보안 정책 확정

필수 기능:

- Admin Runtime Studio
- Conda/Pip package UI
- Dockerfile generation
- Docker build worker
- build log
- import test
- code execution
- 실행 결과 표시
- timeout/memory limit

성공 기준:

- 특정 Course에서 지정된 runtime으로 코드가 실행되고 결과가 본문에 표시된다.

### MVP 4: 고도화

목표: interactive demo와 강의 집중 모드를 추가한다.

기능:

- Marimo app 등록
- Marimo app embed
- Focus Lecture Mode
- PDF/ePub export
- GIF/animation code generation
- 난이도 변환
- 강의 후 annotation 기반 수정안 생성

---

## 18. 성공 지표

### 교수자 지표

- 강의자료 제작 시간 감소
- PPT 별도 제작 감소
- AI 초안 채택률
- AI 생성 그림/코드 설명 사용률
- 강의 후 annotation 공개율

### 학생 지표

- Chapter completion rate
- 공개 annotation 조회율
- 영상/GIF/interactive demo 사용률
- quiz 완료율
- 설치 관련 문의 감소

### 시스템 지표

- page load time
- annotation save success rate
- annotation sync failure rate
- Docker build success rate
- code execution success rate
- runtime error rate

---

## 19. 주요 리스크와 대응

### 19.1 annotation 위치 어긋남

위험:

- 화면 크기와 콘텐츠 변경으로 판서 위치가 어긋날 수 있다.

대응:

- Block stable ID
- block-normalized coordinates
- content_hash drift warning
- 영향 annotation 검토 뷰

### 19.2 AI 산출물의 부정확성

위험:

- 과학적으로 틀린 그림이나 설명이 생성될 수 있다.

대응:

- draft-only
- Author approval
- provenance 저장
- 과학 그림은 코드 렌더 우선

### 19.3 코드 실행 보안

위험:

- 임의 코드 실행, 자원 남용, 네트워크 접근 문제가 발생할 수 있다.

대응:

- Docker sandbox
- non-root user
- network off by default
- timeout/memory limit
- execution audit log

### 19.4 저작 UX 복잡도

위험:

- 너무 많은 block 타입과 기능이 Author에게 부담이 될 수 있다.

대응:

- MVP에서는 Markdown 중심
- block inspector는 최소화
- AI 삽입 workflow를 단순화

### 19.5 Supabase 역할 과부하

위험:

- Supabase로 Docker build나 장시간 실행까지 처리하려고 하면 구조가 무너진다.

대응:

- Supabase는 DB/Auth/Storage/Realtime에 집중
- Docker build와 code execution은 Execution Layer로 분리

---

## 20. Open Issues

1. **제품명**: Lecture Studio, Hermes Lecture Studio 등 후보 중 확정이 필요하다.
2. **Content source of truth**: Supabase Storage를 우선할지, Git repository를 canonical source로 둘지 결정한다.
3. **MyST parser**: 자체 parser, 기존 library, hybrid 방식 중 선택한다.
4. **Annotation 구현**: custom SVG/canvas layer를 사용할지, tldraw 기반으로 갈지 결정한다.
5. **코드 실행 정책**: 학생 실행 허용 범위와 sandbox 수준을 확정한다.
6. **Runtime package manager**: micromamba/environment.yml을 우선할지, pixi/uv를 도입할지 결정한다.
7. **Git integration**: MVP 포함 여부와 release snapshot 정책을 결정한다.
8. **PDF/ePub export**: Quarto 연동 시점과 품질 기준을 결정한다.
9. **지원 브라우저**: 특히 iPad Safari에서 annotation 지원 범위를 검증한다.
10. **다학기 재사용**: course version과 lecture session 복사 정책을 결정한다.

---

## 21. 최종 권고

### 21.1 기술 스택 판단

Next.js + Supabase 조합은 MVP에 적합하다.

단, 역할을 명확히 분리해야 한다.

```text
Next.js:
  UI, renderer, API orchestration, Lecture Mode

Supabase:
  Auth, DB, Storage, Realtime, RLS

Execution Worker:
  Docker build, code execution, runtime jobs

Content Engine:
  MyST source, Block parser, stable ID, renderer

AI Layer:
  Authoring Assistant, figure/code/quiz draft generation
```

### 21.2 제품 우선순위 판단

최우선은 코드 실행이 아니라 **좋은 전자책 저작 경험과 Lecture Mode**이다.

권장 우선순위:

```text
1. MyST 기반 저작과 Reading Viewer
2. Block stable ID
3. Live Book Lecture Mode
4. Block-based annotation 저장
5. AI Authoring Assistant
6. Docker runtime과 코드 실행
7. Marimo interactive demo
8. Focus Lecture Mode
```

### 21.3 최종 제품 정의

본 플랫폼은 다음과 같이 정의한다.

> **AI로 쉽게 만들고, 전자책 그대로 강의하고, 판서까지 남기며, 강의별 실행환경까지 제공하는 강의형 전자책 플랫폼**

이 정의를 기준으로 MVP를 작게 시작하면, 제품의 핵심 가치를 빠르게 검증할 수 있다.

---

## 22. 범위 제외 항목

MVP에서는 다음을 제외한다.

- 학생용 AI Tutor/RAG
- Generated Slide Mode
- 완전한 LMS 기능
- 출석 관리
- 성적 관리
- 대규모 실시간 다중 사용자 annotation
- 강의 녹화와 annotation timeline 동기화
- 완전한 WYSIWYG editor
- GPU runtime production 운영

이 항목들은 제품 검증 후 확장 후보로 둔다.

---

## 23. 최종 Acceptance Summary

최종적으로 MVP 0~2가 완료되면 다음이 가능해야 한다.

1. Author는 MyST/Markdown으로 Course를 작성할 수 있다.
2. 콘텐츠는 Course–Chapter–Block 구조로 저장된다.
3. 모든 Block은 stable ID와 content_hash를 가진다.
4. 학생은 Reading Mode에서 깔끔하게 전자책을 읽을 수 있다.
5. 강의자는 Lecture Mode에서 전자책 위에 직접 판서할 수 있다.
6. 판서는 Block 정규화 좌표로 저장된다.
7. 강의 세션별 annotation을 저장하고 공개할 수 있다.
8. 학생은 공개된 판서를 복습할 수 있다.
9. instructor-note는 학생에게 절대 노출되지 않는다.
10. AI 생성물은 draft 상태로 생성되고 Author 승인 후 반영된다.
11. AI 산출물에는 provenance가 저장된다.
12. 과학 그림은 가능한 한 코드 렌더링 방식으로 생성된다.

MVP 3 이후에는 다음이 추가된다.

1. 강의별 Docker runtime 생성
2. Admin 패키지 설치 UI
3. 코드 실행과 결과 표시
4. Marimo interactive demo
5. Focus Lecture Mode

---

