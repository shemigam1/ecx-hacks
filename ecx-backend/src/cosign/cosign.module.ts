import { Module } from '@nestjs/common';

/**
 * Owned by Dev B. Week 2: consumes `intent.escalated`, creates CosignRequest (15-min TTL), pushes to
 * the trusted contact over the WebGateway, and emits `cosign.resolved` on approve/deny — which the
 * orchestrator turns into resumeIntent / voidIntent (held-intent state machine, PROJECT.md §5).
 */
@Module({})
export class CosignModule {}
