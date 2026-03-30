<h1 align="center">
  <code>maestro</code>
</h1>

<p align="center">
  <strong>철저함 우선 Claude Code 플러그인</strong><br/>
  훅, 에이전트, MCP 도구로 완료 전 검증을 구조적으로 강제합니다.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="#설치">설치</a> · <a href="#작동-방식">작동 방식</a> · <a href="#에이전트">에이전트</a> · <a href="#스킬">스킬</a> · <a href="#mcp-도구">MCP 도구</a>
</p>

---

## 왜 필요한가

Claude Code는 강력하지만 관대합니다 — 테스트를 실행하지 않고도 "완료"를 선언하고, 파일을 읽지 않고 수정하며, 빌드를 완전히 무시할 수 있습니다. Maestro는 이런 편법이 통하지 않도록 구조적 강제를 추가합니다.

- **Stop 게이트** — 테스트나 빌드를 실행하지 않으면 완료를 차단
- **Read:Write 비율** — 읽기보다 쓰기가 많으면 경고
- **미션 시스템** — 복잡한 작업에 수락 기준을 자동 생성
- **컨텍스트 유지** — 컴팩션 후에도 진행 상태를 보존
- **교차 모델 검증** — Codex, Gemini에 세컨드 오피니언 요청

## 설치

```sh
claude plugin add jbj338033/maestro
```

Node.js >= 22 및 플러그인을 지원하는 Claude Code가 필요합니다.

## 작동 방식

Maestro는 Claude Code 라이프사이클의 모든 단계에 훅을 걸어 동작합니다:

| 훅 | 역할 |
|------|------|
| **SessionStart** | 세션 상태 초기화, 이전 컨텍스트 복원, 교차 세션 메모리 로드 |
| **UserPromptSubmit** | 복잡한 작업을 감지하고 수락 기준이 포함된 미션을 자동 생성 |
| **PreToolUse** | 위험 패턴(`git add -A`, `rm -rf`) 경고 및 Read:Write 비율 추적 |
| **PostToolUse** | 도구 사용 횟수 집계, 수정된 파일 추적, 테스트/빌드 실행 감지 |
| **Stop** | 파일 수정 후 테스트를 실행하지 않으면 완료 차단 |
| **Stop (agent)** | 미션 수락 기준을 실제 코드 대비 검증 |
| **PreCompact** | 컨텍스트 압축 전 목표, 진행 상태, 미션 저장 |
| **PostCompact** | 압축 후 저장된 상태 복원 |
| **SubagentStart/Stop** | 활성 서브에이전트 추적 |
| **SessionEnd** | 세션 기록 저장 및 파일 수정 패턴 학습 |

## 에이전트

역할이 명확히 구분된 6개의 전문 에이전트:

| 에이전트 | 모델 | 쓰기 권한 | 목적 |
|----------|------|:---------:|------|
| **researcher** | Sonnet | - | 구현 전 읽기 전용 코드베이스 탐색 |
| **verifier** | Sonnet | - | 증거 기반 검증 — 모든 주장에 `명령 → 출력` 증거 필요 |
| **critic** | Opus | - | 보안, 유지보수성, 성능 관점의 심층 리뷰 |
| **codex-bridge** | Sonnet | O | OpenAI Codex CLI에 작업 위임 |
| **gemini-bridge** | Sonnet | O | Google Gemini CLI에 작업 위임 |
| **synthesizer** | Opus | - | 여러 모델의 출력을 통합된 권장사항으로 조율 |

## 스킬

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| **ask** | `/maestro:ask <codex\|gemini> "질문"` | 외부 모델에 질의 |
| **status** | `/maestro:status` | 세션 상태, 미션 진행도, 검증 상태 표시 |

## MCP 도구

Maestro MCP 서버는 세션 전반에 걸쳐 영속적 상태를 제공합니다:

| 도구 | 설명 |
|------|------|
| `state_read` | 세션 상태 조회 (목표, 진행도, 도구 사용 횟수, 검증 상태) |
| `state_write` | 세션 상태 갱신 |
| `mission_read` | 현재 미션 목표 및 수락 기준 조회 |
| `mission_update` | 수락 기준의 검증 여부 표시 |
| `memory_read` | 교차 세션 메모리 조회 (컨벤션, 결정 사항, 패턴) |

## 아키텍처

```
maestro/
├── .claude-plugin/     # 플러그인 메타데이터
├── .mcp.json           # MCP 서버 등록
├── agents/             # 서브에이전트 정의 (6개)
├── hooks/              # 훅 이벤트 설정
├── scripts/            # 훅 구현체
│   ├── lib/            # 공유 유틸리티 (state, mission, memory, stdin)
│   ├── session-start.mjs
│   ├── prompt-analyze.mjs
│   ├── pre-tool-guard.mjs
│   ├── post-tool-audit.mjs
│   ├── stop-gate.mjs
│   ├── pre-compact-save.mjs
│   ├── post-compact-restore.mjs
│   ├── auto-xval.mjs
│   ├── subagent-track.mjs
│   ├── session-end.mjs
│   └── run.cjs         # ESM 로더 래퍼
├── skills/             # 슬래시 커맨드 스킬
├── src/mcp/            # MCP 서버 (stdio 전송)
└── CLAUDE.md           # 컨텍스트에 주입되는 철저함 프로토콜
```

## Stop 게이트 작동 원리

```
파일 수정됨? ──아니오──→ ✅ 허용
       │
      예
       │
테스트 실행함? ──예──→ ✅ 허용
       │
     아니오
       │
    ❌ 차단
    "테스트와 빌드를 실행한 후 다시 시도하세요."
```

게이트는 세션당 한 번 차단합니다 — 테스트를 실행하고 재시도하면 통과됩니다.

## 라이선스

MIT
