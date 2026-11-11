import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AutenticacionGuard } from '../common/guards/autenticacion.guard.js';
import { CompromisoController } from '../seguridad/compromiso.controller.js';

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
          signOptions: { expiresIn: '30m' }, // cada token indica su propio vencimiento
        };
      },
    }),
  ],
  controllers: [AuthController, CompromisoController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AutenticacionGuard }],
})
export class AuthModule {}
