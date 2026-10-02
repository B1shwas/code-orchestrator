import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { UsersModule } from '../users/users.module';
import { EvidenceBuilderService } from './evidence-builder.service';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

@Module({
  imports: [AuthModule, UsersModule, AnalysisModule, LlmModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService, EvidenceBuilderService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
