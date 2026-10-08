import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { UsersModule } from '../users/users.module';
import { VerifierService } from './agent/verifier.service';
import { EvidenceBuilderService } from './evidence-builder.service';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

@Module({
  imports: [AuthModule, UsersModule, AnalysisModule, LlmModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService, EvidenceBuilderService, VerifierService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
