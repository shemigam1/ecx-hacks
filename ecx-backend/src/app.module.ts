import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PolicyModule } from './policy/policy.module';

@Module({
  imports: [PolicyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

