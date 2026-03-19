# Core Infrastructure

Core modules have **no feature dependencies**. Features depend on core, never the reverse.

## Runtime Status

- Current state: `core/` contains provider-neutral contracts; Claude-specific runtime has moved to `src/providers/claude/`.
- `core/runtime/` and `core/providers/` define the chat-facing seam. `ChatRuntime` is the neutral interface; `ClaudeChatRuntime` in `src/providers/claude/runtime/` is the Claude implementation.
- `core/sdk/` re-exports `transformSDKMessage` from the Claude provider via a forwarding shim and contains shared SDK utilities (`typeGuards`, `types`, `toolResultContent`).
- Execution reference: [`docs/multi-provider-execution-plan.md`](../../docs/multi-provider-execution-plan.md)

## Modules

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `agents/` | Custom agent discovery | `AgentManager`, `AgentStorage` |
| `commands/` | Built-in command actions | `builtInCommands` |
| `hooks/` | Security hooks | `SecurityHooks` |
| `images/` | Image caching | SHA-256 dedup, base64 encoding |
| `mcp/` | Model Context Protocol | `McpServerManager`, `McpTester` |
| `plugins/` | Claude Code plugins | `PluginManager` |
| `prompts/` | Prompt templates | `mainAgent`, `inlineEdit`, `instructionRefine`, `titleGeneration` |
| `providers/` | Provider registry and aux service factories | `ProviderRegistry`, `ProviderCapabilities`, `ProviderId` |
| `runtime/` | Provider-neutral runtime contracts | `ChatRuntime`, `ChatTurnRequest`, `PreparedChatTurn`, `SessionUpdateResult`, approval/query types |
| `sdk/` | SDK utilities and re-exports | `typeGuards`, `types`, `toolResultContent`; re-exports `transformSDKMessage` from Claude provider |
| `security/` | Access control | `ApprovalManager` (permission utilities), `BashPathValidator`, `BlocklistChecker` |
| `storage/` | Persistence layer | `StorageService`, `SessionStorage`, `CCSettingsStorage`, `ClaudianSettingsStorage`, `McpStorage`, `SkillStorage`, `SlashCommandStorage`, `VaultFileAdapter` |
| `tools/` | Tool utilities | `toolNames` (incl. plan mode tools), `toolIcons`, `toolInput`, `todo` |
| `types/` | Type definitions | `settings`, `agent`, `mcp`, `chat` (incl. `forkSource?: { sessionId, resumeAt }`), `tools`, `models`, `sdk`, `plugins`, `diff` |

## Refactor Guardrails

- Do not add new feature-layer imports of Claude SDK types or Claude history helpers.
- New provider-neutral contracts should land in `src/core/runtime/` or `src/core/providers/`, not in feature modules.
- Keep generic security and storage primitives in `core/`; move Claude-specific mapping logic behind the provider boundary.
- Auxiliary services (title generation, instruction refinement, inline edit) are created via `ProviderRegistry` factory methods, not instantiated directly in features.

## Dependency Rules

```
types/ ← (all modules can import)
storage/ ← security/, mcp/
sdk/ ← (re-exports from providers/claude/)
```

## Key Patterns

### ChatRuntime
```typescript
// One runtime per tab (lazy init on first query)
const runtime = ProviderRegistry.createChatRuntime({ plugin, mcpManager });
const turn = runtime.prepareTurn(request); // Encode context
for await (const chunk of runtime.query(turn, history)) { ... }
runtime.cancel(); // Cancel streaming
```

### Provider Factories
```typescript
// Aux services created via registry (not direct instantiation)
const titleService = ProviderRegistry.createTitleGenerationService(plugin);
const refineService = ProviderRegistry.createInstructionRefineService(plugin);
const inlineEditService = ProviderRegistry.createInlineEditService(plugin);
```

### Storage (Claude Code pattern)
```typescript
// Settings in vault/.claude/settings.json
await CCSettingsStorage.load(vaultPath);
await CCSettingsStorage.save(vaultPath, settings);

// Sessions: SDK-native (~/.claude/projects/) + metadata overlay (.meta.json)
await SessionStorage.loadSession(vaultPath, sessionId);
```

### Security
- `BashPathValidator`: Vault-only by default, symlink-safe via `realpath`
- `ApprovalManager`: Permission utility functions (`buildPermissionUpdates`, `matchesRulePattern`, etc.)
- `BlocklistChecker`: Platform-specific dangerous commands

## Gotchas

- `ChatRuntime.cleanup()` must be called on tab close
- Storage paths are encoded: non-alphanumeric → `-`
- Plan mode uses dedicated callbacks (`exitPlanModeCallback`, `permissionModeSyncCallback`) that bypass normal approval flow in `canUseTool`. `EnterPlanMode` is auto-approved by the SDK; the stream event is detected to sync UI state.
- Session bookkeeping (`sdkSessionId`, `forkSource`, `previousSdkSessionIds`) is handled by `ChatRuntime.buildSessionUpdates()` — features should not access these fields directly.
