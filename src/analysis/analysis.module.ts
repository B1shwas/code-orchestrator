import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [AuthModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, JwtService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
