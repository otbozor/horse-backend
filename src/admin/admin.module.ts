import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminBlogController } from './admin-blog.controller';
import { AdminService } from './admin.service';
import { BlogModule } from '../blog/blog.module';
import { MediaModule } from '../media/media.module';

@Module({
    imports: [BlogModule, MediaModule],
    controllers: [AdminController, AdminListingsController, AdminBlogController],
    providers: [AdminService],
    exports: [AdminService],
})
export class AdminModule { }
