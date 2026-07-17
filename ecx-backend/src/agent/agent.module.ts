import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { AuditModule } from '../audit/audit.module';
import { LLM_PROVIDER } from '../llm/llm-provider';
import { OpenRouterLlmProvider } from '../llm/openrouter.provider';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';

/**
 * Owned by Dev B. The Anthropic-free agent loop: Qwen3 via OpenRouter behind LLM_PROVIDER (swappable),
 * wired to the spine's PaymentOrchestrator + ContextQuery (via the 'PaymentOrchestrator' / 'ContextQuery'
 * tokens exported by PaymentsModule). Swap the LLM_PROVIDER useClass to trial a different model —
 * the model is not a trust boundary.
 */
@Module({
  imports: [PrismaModule, PaymentsModule, AuditModule],
  controllers: [AgentController],
  providers: [AgentService, { provide: LLM_PROVIDER, useClass: OpenRouterLlmProvider }],
  exports: [AgentService],
})
export class AgentModule {}
