# Multi-Provider Execution Plan

## Objective

Extract a provider boundary without changing current product behavior.

## Current Branch Status

All PR1 phases are complete and all compatibility re-export shims have been removed. Consumers import directly from canonical paths.

- Phase 1: `ChatRuntime`, `ProviderRegistry`, `ProviderCapabilities`, `ChatTurnRequest`, `PreparedChatTurn` contracts in `src/core/runtime/` and `src/core/providers/`
- Phase 2: Claude runtime extracted to `src/providers/claude/runtime/` — old `src/core/agent/` directory deleted
- Phase 3: Auxiliary services in `src/providers/claude/aux/` — old feature-layer service files deleted; zero `@anthropic-ai/claude-agent-sdk` imports in `src/features/`
- Phase 4: Chat controllers and tabs depend on `ChatRuntime` interface, not `ClaudianService` directly
- Phase 5: `InputController` builds structured `ChatTurnRequest`; `ChatRuntime.prepareTurn()` handles provider-specific prompt encoding; `main.ts` loads history from `src/providers/claude/history/` — old `src/utils/sdkSession.ts` and `src/utils/claudeCli.ts` shims deleted
- Phase 6: All shims removed, 4602 tests pass, typecheck and build clean

All 6 success criteria verified.

The immediate goal is not "ship Codex". The immediate goal is to make Codex support additive by moving Claude-specific runtime knowledge behind a thin facade first.

## Ground Truth

- Claudian already supports Anthropic-compatible custom endpoints through environment variables such as `ANTHROPIC_BASE_URL`.
- The codebase is still Claude-shaped internally:
  - chat tabs create `ClaudianService` directly
  - `InputController` assembles Claude XML-like prompt context
  - `main.ts` reads Claude-native history via `src/utils/sdkSession.ts`
  - title generation, instruction refinement, and inline edit call the Claude SDK directly
- Current persistence schema is also Claude-shaped:
  - `Conversation`
  - `ChatMessage`
  - `SessionMetadata`
  - provider-owned fields like `sdkSessionId`, `previousSdkSessionIds`, `resumeSessionAt`, and `forkSource`

That reality is acceptable for PR1. The work is to isolate ownership first, not to pretend the schema is already provider-neutral.

## Non-Negotiable Constraints

- Preserve all existing Claude behavior in PR1.
- Do not redesign the chat UX, tab UX, or settings UX in PR1.
- Do not add native Codex behavior in PR1.
- Keep the runtime facade thin. Avoid building a second orchestrator layer.
- Preserve the current stored conversation schema and replay model in PR1.
- Prefer compatibility re-exports over giant move-only diffs when it improves reviewability.

## Success Criteria

PR1 is successful when all of the following are true:

- UI-facing chat modules depend on a thin runtime facade, not on `ClaudianService` directly.
- `main.ts` no longer reads Claude-native history formats directly.
- All direct Claude SDK call sites live under a Claude adaptor family.
- Prompt encoding is provider-owned rather than built in the chat controller.
- Existing session storage and history replay continue to work unchanged from the user's perspective.
- A future Codex adaptor can be added without reopening the entire chat stack.

## Recommended End-State Structure

### Provider-neutral

- `src/core/runtime/ChatRuntime.ts`
- `src/core/runtime/types.ts`
- `src/core/providers/types.ts`
- `src/core/providers/ProviderRegistry.ts`

### Claude adaptor

- `src/providers/claude/runtime/ClaudeChatRuntime.ts`
- `src/providers/claude/runtime/ClaudeMessageChannel.ts`
- `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts`
- `src/providers/claude/runtime/ClaudeSessionManager.ts`
- `src/providers/claude/stream/transformClaudeMessage.ts`
- `src/providers/claude/history/ClaudeHistoryStore.ts`
- `src/providers/claude/runtime/ClaudeCliResolver.ts`
- `src/providers/claude/prompt/ClaudeTurnEncoder.ts`
- `src/providers/claude/aux/ClaudeTitleGenerationService.ts`
- `src/providers/claude/aux/ClaudeInstructionRefineService.ts`
- `src/providers/claude/aux/ClaudeInlineEditService.ts`

## Phase Plan

### Phase 0: Baseline and Guardrails

### Goal

Pin current behavior before moving runtime ownership.

### Files to inspect or extend

- `src/main.ts`
- `src/core/types/chat.ts`
- `src/core/agent/*`
- `src/core/sdk/transformSDKMessage.ts`
- `src/utils/sdkSession.ts`
- `src/utils/claudeCli.ts`
- `src/features/chat/controllers/*`
- `src/features/chat/tabs/*`
- `src/features/chat/services/*`
- `src/features/inline-edit/InlineEditService.ts`
- existing tests under `tests/`

### Tasks

- Inventory all UI-facing imports of `src/core/agent`.
- Inventory all direct imports of `@anthropic-ai/claude-agent-sdk`.
- Identify current tests that protect streaming, rewind, fork, title generation, inline edit, and history reload.
- Add missing tests for any critical flow that would otherwise be unprotected during the move.

### Exit criteria

- The team has an explicit list of direct Claude coupling points.
- Critical runtime flows are pinned by tests or a written manual smoke checklist.

### Phase 1: Introduce the Thin Runtime Facade

### Goal

Create the minimal provider-neutral API that the chat feature actually needs.

### New files

- `src/core/runtime/ChatRuntime.ts`
- `src/core/runtime/types.ts`
- `src/core/providers/types.ts`
- `src/core/providers/ProviderRegistry.ts`

### Likely supporting touches

- `src/core/types/index.ts`
- `src/features/chat/state/types.ts`

### Tasks

- Define `ProviderId`.
- Define `ProviderCapabilities`.
- Define `ChatTurnRequest` as structured input rather than provider prompt text.
- Define runtime conversation context and lifecycle methods needed by tabs and controllers.
- Register only `claude` in the provider registry for PR1.
- Keep the interface intentionally narrow:
  - `ensureReady`
  - `setConversation`
  - `query`
  - `cancel`
  - `rewind`
  - `dispose`

### Exit criteria

- The new facade compiles.
- The facade does not import provider-specific implementation details.
- The API surface is small enough that the Claude adaptor can mostly pass through existing behavior.

### Phase 2: Extract the Claude Runtime Into an Adaptor Package

### Goal

Move the main Claude runtime implementation under `src/providers/claude/` without changing behavior.

### Primary moves

- `src/core/agent/ClaudianService.ts` -> `src/providers/claude/runtime/ClaudeChatRuntime.ts`
- `src/core/agent/MessageChannel.ts` -> `src/providers/claude/runtime/ClaudeMessageChannel.ts`
- `src/core/agent/QueryOptionsBuilder.ts` -> `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts`
- `src/core/agent/SessionManager.ts` -> `src/providers/claude/runtime/ClaudeSessionManager.ts`
- `src/core/sdk/transformSDKMessage.ts` -> `src/providers/claude/stream/transformClaudeMessage.ts`
- `src/utils/sdkSession.ts` -> `src/providers/claude/history/ClaudeHistoryStore.ts`
- `src/utils/claudeCli.ts` -> `src/providers/claude/runtime/ClaudeCliResolver.ts`

### Supporting files that may need follow-up edits

- `src/core/agent/index.ts`
- `src/core/agent/types.ts`
- `src/core/sdk/index.ts`
- `src/core/types/sdk.ts`
- `src/core/hooks/SecurityHooks.ts`
- `src/core/security/ApprovalManager.ts`

### Tasks

- Move provider-owned code into the new Claude package.
- Keep old import paths as compatibility re-exports when that reduces churn in the same PR.
- Avoid mixing new neutral abstractions into Claude internals unless the UI needs them.
- Keep provider-specific event normalization owned by the Claude package.

### Exit criteria

- Claude runtime code lives under `src/providers/claude/`.
- Old paths either disappear cleanly or become thin shims.
- Behavior remains unchanged under existing tests.

### Phase 3: Move Claude Auxiliary Flows Behind the Same Boundary

### Goal

Eliminate Claude SDK calls from feature services outside the provider package.

### Primary moves

- `src/features/chat/services/TitleGenerationService.ts` -> `src/providers/claude/aux/ClaudeTitleGenerationService.ts`
- `src/features/chat/services/InstructionRefineService.ts` -> `src/providers/claude/aux/ClaudeInstructionRefineService.ts`
- `src/features/inline-edit/InlineEditService.ts` -> `src/providers/claude/aux/ClaudeInlineEditService.ts`

### Related prompt ownership to review

- `src/core/prompts/titleGeneration.ts`
- `src/core/prompts/instructionRefine.ts`
- `src/core/prompts/inlineEdit.ts`
- any Claude-specific helper used only to build Claude prompt text

### Tasks

- Introduce provider-owned entry points for title generation, instruction refinement, and inline edit.
- Stop importing the Claude SDK directly from feature modules.
- Move or wrap prompt files that are only meaningful to Claude flows.
- Keep feature-layer APIs stable where possible so UI churn stays small.

### Exit criteria

- No feature service imports `@anthropic-ai/claude-agent-sdk` directly.
- Auxiliary Claude flows are discoverable from the Claude adaptor boundary.

### Phase 4: Rewire Chat UI Modules to the Runtime Facade

### Goal

Make chat tabs and controllers depend on `ChatRuntime` instead of `ClaudianService`.

### Primary files

- `src/features/chat/ClaudianView.ts`
- `src/features/chat/tabs/types.ts`
- `src/features/chat/tabs/Tab.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/chat/controllers/InputController.ts`
- `src/features/chat/controllers/ConversationController.ts`
- `src/features/chat/controllers/StreamController.ts`
- `src/features/chat/state/types.ts`
- `src/features/chat/ui/InputToolbar.ts`

### Main tasks

- Replace `ClaudianService` references with `ChatRuntime`.
- Ensure tab creation obtains runtimes through `ProviderRegistry`.
- Expose provider capabilities to UI instead of assuming Claude capabilities directly.
- Keep per-tab lifecycle behavior unchanged:
  - lazy creation
  - cancel
  - prewarm
  - disposal on tab close

### Exit criteria

- Chat feature no longer imports runtime implementation classes directly.
- The only runtime dependency from UI is the provider-neutral facade plus capability types.

### Phase 5: Move Prompt Encoding and History Hydration Ownership

### Goal

Remove the remaining Claude knowledge from `InputController` and `main.ts`.

### Primary files

- `src/features/chat/controllers/InputController.ts`
- `src/main.ts`
- `src/providers/claude/prompt/ClaudeTurnEncoder.ts`
- `src/providers/claude/history/ClaudeHistoryStore.ts`

### Current Claude-specific inputs to move out of the UI

- current note XML append
- editor selection XML append
- browser selection append
- canvas selection append
- context file append
- special handling required so `/compact` stays recognizable
- any provider-specific MCP request transformation

### Current Claude-specific history work to move out of `main.ts`

- session existence checks
- native JSONL parsing and merge
- branch filtering through `resumeSessionAt`
- subagent sidecar hydration
- provider-specific deletion and rebuild helpers

### Tasks

- Make `InputController` build a structured `ChatTurnRequest`, not final Claude prompt text.
- Move provider prompt encoding to the Claude adaptor.
- Make `main.ts` call provider-owned history loading APIs instead of `sdkSession` helpers directly.
- Keep current persisted schema unchanged, but make the Claude adaptor the only code that understands Claude-native history details.

### Exit criteria

- `InputController` does not assemble Claude prompt syntax directly.
- `main.ts` does not import `sdkSession` or Claude-native history helpers directly.
- Provider-specific history parsing is isolated to the Claude package.

### Phase 6: Hardening, Cleanup, and PR2 Readiness

### Goal

Finish PR1 in a state that is easy to extend.

### Tasks

- Remove temporary shims that no longer improve reviewability.
- Add provider-boundary documentation where the new modules live.
- Confirm there are no new UI imports from provider-specific implementation modules.
- Produce a short follow-up backlog for PR2 rather than sneaking Codex work into PR1.

### Exit criteria

- Direct Claude imports are isolated to the Claude package and explicitly shared low-level utilities.
- The codebase has a clear place to add `src/providers/codex/` later.

## File-Level Coupling Checklist

These are the concrete files that should be treated as first-class refactor targets:

### Direct Claude SDK call sites

- `src/core/agent/ClaudianService.ts`
- `src/core/agent/QueryOptionsBuilder.ts`
- `src/core/agent/MessageChannel.ts`
- `src/core/agent/customSpawn.ts`
- `src/core/sdk/transformSDKMessage.ts`
- `src/features/chat/services/TitleGenerationService.ts`
- `src/features/chat/services/InstructionRefineService.ts`
- `src/features/inline-edit/InlineEditService.ts`

### UI-facing modules currently coupled to Claude runtime or Claude-shaped session state

- `src/features/chat/controllers/InputController.ts`
- `src/features/chat/controllers/ConversationController.ts`
- `src/features/chat/controllers/StreamController.ts`
- `src/features/chat/tabs/Tab.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/chat/tabs/types.ts`
- `src/features/chat/ui/InputToolbar.ts`

### Main-process and persistence coupling

- `src/main.ts`
- `src/utils/sdkSession.ts`
- `src/utils/claudeCli.ts`
- `src/core/types/chat.ts`
- `src/core/storage/SessionStorage.ts`

## Definition of Done

The following flows must still work before PR1 is complete:

- regular streaming chat
- queued follow-up message while streaming
- model switching
- thinking or reasoning updates
- permission modes, including plan mode
- `/compact`
- MCP mention activation
- title generation
- instruction refinement
- inline edit
- fork conversation
- rewind
- native history reload after restart
- session invalidation after environment change
- tab restore and active-tab prewarm
- subagent recovery from persisted data

## Test Strategy

### Unit tests to add or preserve

- provider registry resolution
- runtime facade request mapping
- Claude prompt encoding from structured request input
- Claude history loader branch filtering and replay merge
- Claude event normalization
- auxiliary flow adapters for title generation, instruction refinement, and inline edit

### Integration tests to preserve

- conversation send and stream lifecycle
- rewind and fork behavior
- conversation persistence and restore
- session invalidation and rebuild
- tab switching and per-tab runtime isolation

### Manual smoke checklist

- open an existing native session and confirm messages hydrate correctly
- send a message with note context, editor selection, and MCP usage
- trigger `/compact`
- fork from a mid-conversation turn
- rewind and resend
- use inline edit in both selection and cursor modes
- trigger plan mode and approve in a new session

## Review and Commit Slicing

Recommended commit order:

1. provider-neutral contracts and registry
2. Claude runtime move plus compatibility shims
3. Claude history and auxiliary service move
4. UI rewiring to `ChatRuntime`
5. prompt encoding move out of `InputController`
6. tests and final cleanup

This ordering keeps architectural intent visible in review and avoids mixing mechanical file moves with semantic behavior changes.

## Decisions Explicitly Deferred to PR2

- provider-neutral persistence schema redesign
- provider switch UX
- Codex capability mapping details
- broad renaming of Claude-shaped stored fields
- any attempt to unify all provider tool schemas beyond what the current UI already needs

## Recommended Starting Point For the Next Session

Start with Phase 0 plus Phase 1 in the same session if the baseline tests are already reasonably strong.

If the codebase lacks coverage for fork, rewind, or native history hydration, stop and add those guardrails first. The runtime extraction is too risky otherwise.
