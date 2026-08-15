import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { StorageService } from '../storage/storage.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [CONFIG_TOKEN],
      useFactory: (config: AppConfig) => ({
        // Files stay in memory: they are small by policy and go straight to the
        // storage driver, so there is no temporary file to clean up or leak.
        limits: { fileSize: config.UPLOAD_MAX_BYTES, files: 1 },
      }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, StorageService],
  exports: [StorageService],
})
export class AttachmentsModule {}
