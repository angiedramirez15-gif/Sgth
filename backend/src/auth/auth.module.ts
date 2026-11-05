import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AutenticacionGuard } from '../common/guards/autenticacion.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secreto = config.getOrThrow<string>('JWT_SECRETO');
        if (secreto.length < 32) {
          throw new Error('JWT_SECRETO en .env debe tener al menos 32 caracteres');
        }
        return {
          secret: secreto,
          signOptions: { expiresIn: config.get('JWT_EXPIRA', '8h') },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AutenticacionGuard }],
})
export class AuthModule {}
