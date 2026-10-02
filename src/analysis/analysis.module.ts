import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AstService } from './ast/ast.service';

@Module({
  imports: [AuthModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, AstService],
  exports: [AnalysisService, AstService],
})
export class AnalysisModule {}
