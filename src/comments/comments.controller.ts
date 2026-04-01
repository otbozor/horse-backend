import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { User } from '@prisma/client';

@Controller('comments')
export class CommentsController {
    constructor(private commentsService: CommentsService) { }

    @Get('listing/:listingId')
    async getComments(@Param('listingId') listingId: string) {
        return this.commentsService.getComments(listingId);
    }

    @Post('listing/:listingId')
    @UseGuards(JwtAuthGuard)
    async addComment(
        @Param('listingId') listingId: string,
        @Body('content') content: string,
        @Body('parentId') parentId: string | undefined,
        @CurrentUser() user: User,
    ) {
        return this.commentsService.addComment(user.id, listingId, content, parentId);
    }

    @Delete(':commentId')
    @UseGuards(JwtAuthGuard)
    async deleteComment(@Param('commentId') commentId: string, @CurrentUser() user: User) {
        return this.commentsService.deleteComment(user.id, commentId);
    }
}
