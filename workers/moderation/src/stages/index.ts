import type { ModerationStage } from '../types.js';
import { malwareStage } from './01-malware.js';
import { aiSafetyStage } from './02-ai-safety.js';
import { licenseStage } from './03-license.js';
import { contentPolicyStage } from './04-content-policy.js';
import { humanReviewStage } from './05-human-review.js';
import { publishStage } from './06-publish.js';

/** Ordered exactly per CONTRACTS.md §13: MALWARE -> AI_SAFETY -> LICENSE -> CONTENT_POLICY ->
 * HUMAN_REVIEW (when needed) -> PUBLISH. */
export const MODERATION_PIPELINE: ModerationStage[] = [malwareStage, aiSafetyStage, licenseStage, contentPolicyStage, humanReviewStage, publishStage];

export { malwareStage, aiSafetyStage, licenseStage, contentPolicyStage, humanReviewStage, publishStage };
