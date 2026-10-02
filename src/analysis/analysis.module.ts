import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AST_ADAPTERS, AstService } from './ast/ast.service';
import { defaultAdapters } from './ast/language.registry';

@Module({
  imports: [AuthModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    AstService,
    {
      provide: AST_ADAPTERS,
      useFactory: defaultAdapters,
    },
  ],
  exports: [AnalysisService, AstService],
})
export class AnalysisModule {}
