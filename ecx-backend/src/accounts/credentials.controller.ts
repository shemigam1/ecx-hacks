import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Read model + revoke for the web Policy page.
 * `GET /credentials/:id/policy` returns the raw rules (the UI renders them as plain sentences).
 * `POST /credentials/:id/revoke` sets status REVOKED — the policy engine checks status at eval time,
 * so revocation takes effect on the next payment immediately.
 */
@Controller('credentials')
export class CredentialsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get(':id/policy')
  async policy(@Param('id') id: string) {
    const cred = await this.prisma.credential.findUnique({ where: { id }, include: { policyRules: true } });
    if (!cred) throw new NotFoundException(`credential ${id} not found`);
    return this.toSummary(cred);
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string) {
    const existing = await this.prisma.credential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`credential ${id} not found`);

    const updated = await this.prisma.credential.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
      include: { policyRules: true },
    });
    await this.audit.log(existing.accountId, 'OWNER', 'credential.revoked', { credentialId: id, label: existing.label });
    return this.toSummary(updated);
  }

  private toSummary(cred: { id: string; label: string; status: string; policyRules: { ruleType: string; params: unknown }[] }) {
    return {
      credentialId: cred.id,
      label: cred.label,
      status: cred.status,
      rules: cred.policyRules.map((r) => ({ ruleType: r.ruleType, params: r.params })),
    };
  }
}
