import { Module } from '@nestjs/common';

/**
 * Owned by Dev B. Week 1: Anthropic tool-use loop over text, running against the FAKE orchestrator +
 * FAKE context (contracts/fakes) until Dev A's real spine lands. Week 3: STT/TTS + voice.
 *
 * Tools exposed to the model: get_user_context, get_policy_summary, list_recent_transactions,
 * initiate_payment, read_last_token, request_cosign_status, flag_suspicious.
 * Hard rule: every payment attempt goes through `initiate_payment` — the LLM never reaches a provider.
 */
@Module({})
export class AgentModule {}
