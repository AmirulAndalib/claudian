import type { CursorContext } from '../../utils/editor';
import type { InstructionRefineResult } from '../types';

export type ProviderId = 'claude' | 'codex';

export interface ProviderCapabilities {
  providerId: ProviderId;
  supportsPersistentRuntime: boolean;
  supportsNativeHistory: boolean;
  supportsPlanMode: boolean;
  supportsRewind: boolean;
  supportsFork: boolean;
  supportsProviderCommands: boolean;
  reasoningControl: 'effort' | 'token-budget' | 'none';
}

export const DEFAULT_CHAT_PROVIDER_ID = 'claude' as const satisfies ProviderId;

export const CLAUDE_PROVIDER_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  providerId: 'claude',
  supportsPersistentRuntime: true,
  supportsNativeHistory: true,
  supportsPlanMode: true,
  supportsRewind: true,
  supportsFork: true,
  supportsProviderCommands: true,
  reasoningControl: 'effort',
});

// ---------------------------------------------------------------------------
// Auxiliary service contracts
// ---------------------------------------------------------------------------

// -- Title generation --

export type TitleGenerationResult =
  | { success: true; title: string }
  | { success: false; error: string };

export type TitleGenerationCallback = (
  conversationId: string,
  result: TitleGenerationResult
) => Promise<void>;

export interface TitleGenerationService {
  generateTitle(
    conversationId: string,
    userMessage: string,
    callback: TitleGenerationCallback
  ): Promise<void>;
  cancel(): void;
}

// -- Instruction refinement --

export type RefineProgressCallback = (update: InstructionRefineResult) => void;

export interface InstructionRefineService {
  resetConversation(): void;
  refineInstruction(
    rawInstruction: string,
    existingInstructions: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult>;
  continueConversation(
    message: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult>;
  cancel(): void;
}

// -- Inline edit --

export type InlineEditMode = 'selection' | 'cursor';

export interface InlineEditSelectionRequest {
  mode: 'selection';
  instruction: string;
  notePath: string;
  selectedText: string;
  startLine?: number;
  lineCount?: number;
  contextFiles?: string[];
}

export interface InlineEditCursorRequest {
  mode: 'cursor';
  instruction: string;
  notePath: string;
  cursorContext: CursorContext;
  contextFiles?: string[];
}

export type InlineEditRequest = InlineEditSelectionRequest | InlineEditCursorRequest;

export interface InlineEditResult {
  success: boolean;
  editedText?: string;
  insertedText?: string;
  clarification?: string;
  error?: string;
}

export interface InlineEditService {
  resetConversation(): void;
  editText(request: InlineEditRequest): Promise<InlineEditResult>;
  continueConversation(message: string, contextFiles?: string[]): Promise<InlineEditResult>;
  cancel(): void;
}
