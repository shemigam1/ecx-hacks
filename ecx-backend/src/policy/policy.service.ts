import { Injectable } from '@nestjs/common';
import { Credential, PaymentIntent, PolicyDecision, PolicyEngine, PolicyEvalContext } from '../contracts';
import { evaluate } from './policy.evaluator';

/**
 * Nest-injectable wrapper over the pure evaluator (contracts' PolicyEngine seam).
 * Kept trivial on purpose: all logic lives in the pure, exhaustively-tested `evaluate`.
 */
@Injectable()
export class PolicyService implements PolicyEngine {
  evaluate(intent: PaymentIntent, credential: Credential, ctx: PolicyEvalContext): PolicyDecision {
    return evaluate(intent, credential, ctx);
  }
}
