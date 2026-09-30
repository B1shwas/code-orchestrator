import { Module } from '@nestjs/common';
import { TokenCipherService } from '../common/crypto/token-cipher.service';
import { UsersService } from './users.service';

@Module({
  providers: [TokenCipherService, UsersService],
  exports: [TokenCipherService, UsersService],
})
export class UsersModule {}
