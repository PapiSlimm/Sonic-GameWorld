export const PACKAGE_NAME = '@sonic-gameworld/ai-sdk';

export {
  AIToolNameSchema,
  type AIToolName,
  AI_TOOL_NAMES,
  AIAgentRoleSchema,
  type AIAgentRole,
  AI_AGENT_ROLES,
  AIPermissionSchema,
  type AIPermission,
  AI_TOOL_SCHEMAS,
  type AIToolArgs,
  AI_TOOL_DEFINITIONS,
  type AIToolDefinition,
  ToolCallSchema,
  type ToolCall,
  validateToolCall,
  PlacementSchema,
  type Placement,
} from '@sonic-gameworld/world-schema';

export { parseCommandMock, type ParseContext } from './parse-command-mock.js';
