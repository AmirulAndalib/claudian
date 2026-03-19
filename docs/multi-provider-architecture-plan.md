# Multi-Provider Architecture Plan

## Scope

This document defines the architecture target for moving Claudian from a Claude-shaped internal implementation to a `UI -> thin runtime facade -> provider adaptor` design.

The current branch implements only the first seam of that target: `src/core/runtime/`, `src/core/providers/`, and chat-side rewiring to `ChatRuntime`. Claude-owned history loading, prompt encoding, and auxiliary SDK services are still intentionally outside this slice.

Claudian already supports Anthropic-compatible custom endpoints through environment configuration, but the runtime, session lifecycle, prompt encoding, and history loading are still Claude-specific today.

Execution sequencing, file-level work, and acceptance criteria live in [`docs/multi-provider-execution-plan.md`](multi-provider-execution-plan.md).

This plan covers:

- Step 1: architecture survey and target design
- PR1: extract the smallest provider-facing boundary and wrap the current Claude implementation as the first provider adaptor
- PR2: add a Codex adaptor later without reworking the UI again

This plan does not cover:

- shipping Codex support in the same PR
- redesigning the current chat UX
- removing Claude-specific features from the product

## Current Architecture Summary

The current codebase is already modular at the feature level, but the provider boundary is not isolated.

### Main runtime flow

1. `src/main.ts` loads settings, conversations, native session metadata, MCP/plugins/agents, and registers the chat view.
2. `src/features/chat/ClaudianView.ts` creates the shell and restores tabs.
3. Each tab lazily creates a `ClaudianService`.
4. `InputController.sendMessage()` collects UI state, appends Claude-oriented context markup, creates optimistic messages, and drives the stream loop.
5. `ClaudianService.query()` chooses warm persistent query vs cold start, handles resume/fork/rebuild, and normalizes Claude SDK messages into `StreamChunk`.
6. `StreamController` mutates in-memory messages and DOM incrementally.
7. `ConversationController.save()` persists overlay metadata, while Claude SDK native JSONL remains the source of truth for many message bodies.

### High-value existing separations

- `features/chat` already isolates UI state, rendering, controllers, and tab management.
- `core/storage` already isolates vault persistence mechanics.
- `core/agent/QueryOptionsBuilder.ts`, `SessionManager.ts`, and `core/sdk/transformSDKMessage.ts` are separable runtime pieces.

### Current structural problem

The Claude boundary cuts through the entire stack:

- UI controllers know Claude prompt syntax.
- generic chat types store Claude session identifiers directly
- `main.ts` reads Claude native session files directly
- three side services call Claude SDK without going through `ClaudianService`
- toolbar/settings logic assumes Claude runtime capabilities

## Current Claude Coupling Inventory

### UI and controller coupling

- `InputController` builds Claude-oriented prompt payloads by appending XML-like note/editor/browser/canvas context.
- `ConversationController`, `Tab`, and `TabManager` manage Claude session semantics through `sessionId`, `sdkSessionId`, `resumeSessionAt`, and `forkSource`.
- `StreamController` knows Claude stream concepts and tool names such as thinking, compact boundary, plan mode tools, task tools, and todo tools.
- `InputToolbar` assumes Claude model families, adaptive thinking, and current permission mode semantics.

### Runtime coupling

- `core/agent/ClaudianService.ts` mixes transport, session lifecycle, permission bridging, dynamic updates, restart policy, and message normalization.
- `core/sdk/transformSDKMessage.ts` is Claude-specific but writes directly into a generic `StreamChunk` contract.
- `core/agent/QueryOptionsBuilder.ts` hardcodes Claude CLI and Claude SDK options.

### Persistence coupling

- `src/main.ts` loads Claude-native history from `~/.claude/projects/...`.
- `src/utils/sdkSession.ts` parses Claude session JSONL, queue operations, tool results, subagent sidecars, and interrupt conventions.
- `Conversation` and `ChatMessage` types embed Claude identifiers directly:
  - `sessionId`
  - `sdkSessionId`
  - `previousSdkSessionIds`
  - `resumeSessionAt`
  - `forkSource`
  - `sdkUserUuid`
  - `sdkAssistantUuid`

### Side-channel coupling

These services bypass the main chat runtime and call Claude SDK directly:

- `src/features/chat/services/TitleGenerationService.ts`
- `src/features/chat/services/InstructionRefineService.ts`
- `src/features/inline-edit/InlineEditService.ts`

Those paths must be inside the Claude adaptor family in PR1, or the future Codex work will still hit Claude-specific code outside the adaptor boundary.

## Target Architecture

The target shape should be:

```text
UI Layer
  ClaudianView / TabManager / Controllers / Renderers / UI widgets
      |
      v
Tab-scoped Chat Runtime Facade
  minimal provider-neutral lifecycle surface
  capability exposure
      |
      v
Provider Registry
  resolves the provider package for the tab
      |
      v
Provider Adaptors
  Claude adaptor
  Codex adaptor
  future adaptors
```

The key design choice is deliberate:

- the neutral layer should be thin
- almost everything below the UI should remain provider-owned until a second provider proves a broader abstraction is necessary

## End State Vs PR1 Boundary

The long-term end state and the first safe PR are not identical.

### Long-term end state

- UI does not know provider prompt syntax
- UI does not know provider-native storage layout
- provider outputs are normalized into provider-neutral events
- conversation persistence carries provider-aware state in a generic envelope

### PR1 boundary

PR1 should optimize for behavior preservation.

- introduce a minimal `ChatRuntime` facade and a provider registry
- move all Claude SDK, Claude-native history, prompt encoding, and Claude auxiliary flows under a Claude adaptor package
- keep the current chat-facing runtime contract close to today's `ClaudianService`
- keep the current stored conversation schema and replay model intact
- add only the provider capability descriptors that the UI actually needs

This means PR1 is an extraction of ownership boundaries, not a schema migration and not a broad abstraction exercise.

## Layer Ownership

### UI owns

- DOM creation and rendering
- tab lifecycle and focus/scroll behavior
- local input UX
- welcome/history chrome
- file/image/external-context pickers
- status panel layout
- message replay from current conversation data

### Chat runtime facade owns

- tab-scoped runtime instance lifecycle
- send / cancel / rewind / fork entry points used by the UI
- provider capability exposure to the UI
- minimal handoff between UI state and the selected provider

The facade does not own provider-specific prompt encoding, history parsing, or event normalization.

### Provider adaptor owns

- SDK or CLI invocation
- provider session semantics
- provider-native history loading
- provider-specific checkpoints and branch/fork mechanics
- provider-specific prompt encoding
- provider-specific tool/result/event normalization
- provider-specific model and reasoning controls
- provider-specific permission semantics and command discovery
- provider-specific auxiliary flows:
  - title generation
  - instruction refinement
  - inline edit

## Recommended Module Layout

### New provider-neutral modules

- `src/core/runtime/ChatRuntime.ts`
- `src/core/runtime/types.ts`
- `src/core/providers/types.ts`
- `src/core/providers/ProviderRegistry.ts`

### New Claude adaptor modules

- `src/providers/claude/runtime/ClaudeChatRuntime.ts`
- `src/providers/claude/runtime/ClaudeMessageChannel.ts`
- `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts`
- `src/providers/claude/runtime/ClaudeSessionManager.ts`
- `src/providers/claude/stream/transformClaudeMessage.ts`
- `src/providers/claude/history/ClaudeHistoryStore.ts`
- `src/providers/claude/runtime/ClaudeCliResolver.ts`
- `src/providers/claude/aux/ClaudeTitleGenerationService.ts`
- `src/providers/claude/aux/ClaudeInstructionRefineService.ts`
- `src/providers/claude/aux/ClaudeInlineEditService.ts`

### Suggested migration mapping

- `src/core/agent/ClaudianService.ts` -> `ClaudeChatRuntime.ts`
- `src/core/agent/MessageChannel.ts` -> `ClaudeMessageChannel.ts`
- `src/core/agent/QueryOptionsBuilder.ts` -> `ClaudeQueryOptionsBuilder.ts`
- `src/core/agent/SessionManager.ts` -> `ClaudeSessionManager.ts`
- `src/core/sdk/transformSDKMessage.ts` -> `transformClaudeMessage.ts`
- `src/utils/sdkSession.ts` -> `ClaudeHistoryStore.ts`
- `src/utils/claudeCli.ts` -> `ClaudeCliResolver.ts`

The original files can remain as thin compatibility re-exports during PR1 to keep the diff reviewable.

## Minimal Provider-Neutral Contracts

PR1 should introduce only the provider-neutral contracts that the UI must actually depend on.

### Provider identity

```ts
type ProviderId = 'claude' | 'codex';
```

### Provider capabilities

```ts
interface ProviderCapabilities {
  providerId: ProviderId;
  supportsPersistentRuntime: boolean;
  supportsNativeHistory: boolean;
  supportsPlanMode: boolean;
  supportsRewind: boolean;
  supportsFork: boolean;
  supportsProviderCommands: boolean;
  reasoningControl: 'effort' | 'token-budget' | 'none';
}
```

### Structured turn request

Preferred end state:

The UI should stop building Claude prompt syntax. It should pass structured input and let the provider adaptor encode it.

```ts
interface ChatTurnRequest {
  text: string;
  images?: ImageAttachment[];
  currentNotePath?: string;
  editorSelection?: EditorSelectionContext | null;
  browserSelection?: BrowserSelectionContext | null;
  canvasSelection?: CanvasSelectionContext | null;
  externalContextPaths?: string[];
  enabledMcpServers?: string[];
  modelOverride?: string;
  allowedTools?: string[];
  forceColdStart?: boolean;
}
```

### Minimal runtime facade

```ts
interface ChatRuntime {
  readonly providerId: ProviderId;
  getCapabilities(): ProviderCapabilities;
  ensureReady(options?: EnsureReadyOptions): Promise<boolean>;
  setConversation(context: RuntimeConversationContext): void;
  query(request: ChatTurnRequest): AsyncIterable<StreamChunk>;
  cancel(): void;
  rewind(target: RewindTarget): Promise<RewindResult>;
  dispose(): void;
}
```

The point of this interface is not to model every provider concern. It exists only so the UI can drive a session without importing Claude-specific modules.

### Stream events and stored schema

PR1 compromise:

- keep the current `StreamChunk` contract if changing it would force a broad UI replay rewrite
- keep the current `Conversation` and `ChatMessage` schema
- treat current Claude-shaped fields as adaptor-owned legacy state
- ensure only the Claude adaptor knows how Claude SDK maps into those contracts

## PR1 Plan

PR1 should preserve existing behavior while changing the dependency graph.

### PR1 goals

- keep all existing Claude functionality working
- remove direct Claude SDK imports from UI-oriented modules
- make `main.ts` stop knowing Claude history internals
- move all Claude SDK call sites under one adaptor family
- make future Codex support additive rather than invasive

### PR1 non-goals

- no provider switch UX redesign
- no new Codex behavior yet
- no attempt to unify every tool into a universal schema beyond what the UI already needs

### PR1 implementation sequence

1. Add the runtime facade contract and a `ProviderRegistry` with only `claude`.
2. Move `ClaudianService` internals into the Claude adaptor package and keep a compatibility shim if needed.
3. Move `transformSDKMessage`, `sdkSession`, and `claudeCli` into the Claude adaptor package.
4. Move `TitleGenerationService`, `InstructionRefineService`, and `InlineEditService` into the Claude adaptor package.
5. Change `main.ts`, `Tab`, `InputController`, `ConversationController`, and other UI-facing modules to depend on the runtime facade and provider registry instead of Claude modules directly.
6. Move prompt encoding into the Claude adaptor.
7. Keep the current conversation schema, replay model, and current Claude feature set unchanged.

## Definition Of Done For PR1

The following behavior should still work after the refactor:

- regular chat streaming
- queued follow-up send while streaming
- model switching
- thinking / reasoning updates
- permission modes, including plan mode
- MCP mention activation
- slash commands and provider-discovered commands
- title generation
- instruction refinement mode
- inline edit mode
- fork conversation
- rewind
- native history reload after restart
- session invalidation and history rebuild
- tab restore and active-tab prewarm
- async subagent recovery from persisted sidecar data

## Major Risks And Mitigations

### Risk: partial abstraction only wraps `ClaudianService`

Impact:

- Codex PR still needs to touch `InputController`, `ConversationController`, `main.ts`, and side services.

Mitigation:

- PR1 must include the side SDK call sites, prompt encoding, and provider-specific history loading.

### Risk: the new facade becomes a second logic layer

Impact:

- responsibilities become split between the facade and the adaptor
- Claude behavior remains hard to move because the real logic still leaks upward

Mitigation:

- keep the facade intentionally small
- if a method needs Claude-specific knowledge to work, it belongs in the adaptor
- prefer pass-through composition over re-modeling Claude concepts in neutral terms

### Risk: provider-neutral types stay Claude-shaped

Impact:

- the second provider will either fake Claude fields or force another breaking refactor

Mitigation:

- do not rename schema blindly in PR1
- finish the adaptor boundary first
- introduce a provider-neutral envelope only when Codex session and checkpoint requirements are concrete

### Risk: prompt assembly moves too late

Impact:

- UI remains coupled to Claude XML context encoding and cannot support providers with different input formats

Mitigation:

- move prompt encoding into the Claude adaptor in PR1
- only accept a temporary UI fallback if it is tracked as a blocking follow-up before Codex work begins

### Risk: plan mode remains global settings state

Impact:

- multiple tabs or multiple providers will leak state across sessions

Mitigation:

- keep default permission preference in settings
- move live per-session planning state into tab or runtime state

## Test Strategy

### Unit coverage to add or preserve

- runtime facade request-to-provider mapping
- provider capability exposure
- provider-driven hydration through provider history loaders
- Claude adaptor event normalization
- Claude auxiliary services behind provider interfaces

### Integration coverage to preserve

- `ClaudianService` behavior should move to Claude adaptor integration tests, not disappear
- main conversation load/save/hydrate behavior
- tab switching and session synchronization
- rewind/fork/save flows
- native session reload and session invalidation recovery

### Validation command

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Recommended Review Strategy

PR1 will still be large. Keep it reviewable by structuring commits around boundaries instead of file moves only:

1. provider contracts and runtime facade
2. Claude runtime move
3. Claude history and auxiliary services move
4. UI and `main.ts` rewiring
5. prompt-encoding move and test updates

## Recommendation

Do not treat PR1 as a simple rename of `ClaudianService`.

Do not build a thick orchestrator either.

The correct architectural target is:

- UI stops knowing provider syntax and provider storage
- the chat feature depends on a thin runtime facade, not a large provider-neutral application layer
- Claude becomes the first adaptor package, including chat runtime, prompt encoding, native history loading, and auxiliary SDK services

The correct PR1 is the safest slice of that target:

- extract only the boundary the UI truly needs
- move all Claude knowledge behind it
- preserve the current stored schema and UI replay model

If PR1 achieves that, PR2 can focus on Codex behavior instead of reopening the entire Claude stack first.
