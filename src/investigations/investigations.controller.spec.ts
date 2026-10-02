import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

describe('InvestigationsController', () => {
  let controller: InvestigationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestigationsController],
      providers: [{ provide: InvestigationsService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InvestigationsController>(InvestigationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
