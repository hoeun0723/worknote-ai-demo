# WorkNote AI

Next.js + Supabase + OpenAI 기반의 업무 문서 검색 데모입니다.

이 버전은 아래 흐름을 실제 서비스 구조로 옮긴 상태입니다.

- Supabase Auth 로그인
- 사용자별 문서 저장
- `public` / `private` 문서 구분
- 문서 저장/수정 시 OpenAI 임베딩 생성
- `public OR owner_id = current_user` 조건으로 검색 결과 제한
- 검색 결과 기반 답변 요약 생성

## 주요 구조

- 프론트엔드: Next.js App Router
- 인증/DB: Supabase Auth + Postgres
- 벡터 검색: `pgvector`
- AI:
  - 임베딩: `text-embedding-3-small` 기본값
  - 답변 요약: `gpt-4.1-mini` 기본값

## 폴더

- [app](/C:/Study/worknote-ai-demo/app)
- [components](/C:/Study/worknote-ai-demo/components)
- [lib](/C:/Study/worknote-ai-demo/lib)
- [supabase/schema.sql](/C:/Study/worknote-ai-demo/supabase/schema.sql)
- [.env.example](/C:/Study/worknote-ai-demo/.env.example)

## 실행 전 준비

1. Supabase 프로젝트를 생성합니다.
2. Supabase SQL Editor에서 [supabase/schema.sql](/C:/Study/worknote-ai-demo/supabase/schema.sql)을 실행합니다.
3. 프로젝트 루트에 `.env.local` 파일을 만들고 [.env.example](/C:/Study/worknote-ai-demo/.env.example)을 기준으로 값을 채웁니다.
4. OpenAI API 키를 `OPENAI_API_KEY`에 넣습니다.

예시:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4.1-mini
```

## 실행 방법

```bash
npm install
npm run dev
```

프로덕션 빌드 확인:

```bash
npm run build
```

## 데이터 권한

문서 조회는 DB 정책과 검색 함수 둘 다 같은 규칙을 따릅니다.

- 로그인 안 함: 메인 화면 접근 불가
- 로그인 함 + 승인 대기: 승인 대기 화면만 표시
- 로그인 함 + 승인 완료: `public` 문서 + 내가 소유한 `private` 문서 조회 가능

문서 수정/삭제는 본인 문서만 가능합니다.

## 팀 승인 흐름

- 회원가입 직후 사용자는 `pending` 상태로 생성됩니다.
- 관리자 승인 전에는 문서 조회, 문서 등록, AI 검색이 모두 차단됩니다.
- 관리자만 승인 대기 중인 팀원을 `approve` 또는 `reject` 할 수 있습니다.

첫 관리자 계정은 Supabase SQL Editor에서 직접 지정해야 합니다.

```sql
update public.app_users
set role = 'admin',
    approval_status = 'approved',
    approved_at = now()
where email = 'YOUR_ADMIN_EMAIL';
```

## AI 검색 동작

1. 사용자가 문서를 저장하거나 수정합니다.
2. 서버가 문서를 chunk로 분할합니다.
3. OpenAI Embeddings API로 각 chunk 임베딩을 생성합니다.
4. `document_chunks` 테이블의 `vector` 컬럼에 저장합니다.
5. 검색 시 질의도 임베딩으로 변환합니다.
6. `match_document_chunks` RPC가 유사도 검색을 수행합니다.
7. 상위 결과를 바탕으로 선택적으로 답변 요약을 생성합니다.

## 테이블

- `documents`
  - 문서 본문, 공개 범위, 작성자, 요약, 임베딩 상태 저장
- `document_chunks`
  - 벡터 검색용 chunk + embedding 저장

## 현재 구현된 기능

- 이메일/비밀번호 기반 Supabase 로그인 UI
- 관리자 승인 기반 팀 접근 제어
- 문서 생성/수정/삭제
- Public / Private 공개 범위 설정
- 접근 가능한 문서 목록 조회
- 카테고리/공개 범위/키워드 필터
- OpenAI 임베딩 기반 semantic search
- 검색 결과 기반 답변 요약

## 주의사항

- `OPENAI_API_KEY`는 브라우저에 넣으면 안 됩니다. 서버 환경변수로만 사용하세요.
- OpenAI 호출 비용은 API 키 소유 계정에 별도로 과금됩니다.
- `private` 보호는 Supabase RLS 정책에 의존하므로, SQL 적용 없이 프론트만 배포하면 안 됩니다.

## 검증 상태

- `npm run build` 통과

## 다음 확장 아이디어

- Notion API로 실제 문서 동기화
- 파일 업로드 기반 chunk 추출
- 관리자용 public 문서 승인 플로우
- 검색 로그/사용량 대시보드
- 답변에 출처 링크와 인용 표시 강화
