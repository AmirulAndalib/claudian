import type ClaudianPlugin from '../../main';
import { InlineEditService as ClaudeInlineEditService } from '../../providers/claude/aux/ClaudeInlineEditService';
import { InstructionRefineService as ClaudeInstructionRefineService } from '../../providers/claude/aux/ClaudeInstructionRefineService';
import { TitleGenerationService as ClaudeTitleGenerationService } from '../../providers/claude/aux/ClaudeTitleGenerationService';
import { ClaudeChatRuntime } from '../../providers/claude/runtime';
import type { McpServerManager } from '../mcp';
import type { ChatRuntime } from '../runtime';
import {
  CLAUDE_PROVIDER_CAPABILITIES,
  DEFAULT_CHAT_PROVIDER_ID,
  type InlineEditService,
  type InstructionRefineService,
  type ProviderCapabilities,
  type ProviderId,
  type TitleGenerationService,
} from './types';

export interface CreateChatRuntimeOptions {
  plugin: ClaudianPlugin;
  mcpManager: McpServerManager;
  providerId?: ProviderId;
}

type RegisteredProviderId = typeof DEFAULT_CHAT_PROVIDER_ID;

interface ProviderRegistration {
  capabilities: ProviderCapabilities;
  createRuntime: (options: Omit<CreateChatRuntimeOptions, 'providerId'>) => ChatRuntime;
  createTitleGenerationService: (plugin: ClaudianPlugin) => TitleGenerationService;
  createInstructionRefineService: (plugin: ClaudianPlugin) => InstructionRefineService;
  createInlineEditService: (plugin: ClaudianPlugin) => InlineEditService;
}

const PROVIDERS: Record<RegisteredProviderId, ProviderRegistration> = {
  claude: {
    capabilities: CLAUDE_PROVIDER_CAPABILITIES,
    createRuntime: ({ plugin, mcpManager }) => new ClaudeChatRuntime(plugin, mcpManager),
    createTitleGenerationService: (plugin) => new ClaudeTitleGenerationService(plugin),
    createInstructionRefineService: (plugin) => new ClaudeInstructionRefineService(plugin),
    createInlineEditService: (plugin) => new ClaudeInlineEditService(plugin),
  },
};

function getProviderRegistration(providerId: ProviderId): ProviderRegistration {
  const registration = PROVIDERS[providerId as RegisteredProviderId];
  if (!registration) {
    throw new Error(`Provider "${providerId}" is not registered.`);
  }
  return registration;
}

export class ProviderRegistry {
  static createChatRuntime(options: CreateChatRuntimeOptions): ChatRuntime {
    const providerId = options.providerId ?? DEFAULT_CHAT_PROVIDER_ID;
    return getProviderRegistration(providerId).createRuntime(options);
  }

  static createTitleGenerationService(plugin: ClaudianPlugin, providerId: ProviderId = DEFAULT_CHAT_PROVIDER_ID): TitleGenerationService {
    return getProviderRegistration(providerId).createTitleGenerationService(plugin);
  }

  static createInstructionRefineService(plugin: ClaudianPlugin, providerId: ProviderId = DEFAULT_CHAT_PROVIDER_ID): InstructionRefineService {
    return getProviderRegistration(providerId).createInstructionRefineService(plugin);
  }

  static createInlineEditService(plugin: ClaudianPlugin, providerId: ProviderId = DEFAULT_CHAT_PROVIDER_ID): InlineEditService {
    return getProviderRegistration(providerId).createInlineEditService(plugin);
  }

  static getCapabilities(providerId: ProviderId = DEFAULT_CHAT_PROVIDER_ID): ProviderCapabilities {
    return getProviderRegistration(providerId).capabilities;
  }

  static getRegisteredProviderIds(): ProviderId[] {
    return Object.keys(PROVIDERS) as ProviderId[];
  }
}
