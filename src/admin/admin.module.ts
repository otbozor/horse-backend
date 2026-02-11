import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminBlogController } from './admin-blog.controller';
import { AdminProductsController } from './admin-products.controller';
import { AdminEventsController } from './admin-events.controller';
import { AdminService } from './admin.service';
import { AdminProductsService } from './admin-products.service';
import { BlogModule } from '../blog/blog.module';
import { MediaModule } from '../media/media.module';
import { EventsModule } from '../events/events.module';

@Module({
    imports: [BlogModule, MediaModule, EventsModule],
    controllers: [
        AdminController,
        AdminListingsController,
        AdminBlogController,
        AdminProductsController,
        AdminEventsController,
    ],
    providers: [AdminService, AdminProductsService],
    exports: [AdminService],
})
export class AdminModule { }
