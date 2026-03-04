import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventStatus } from '@prisma/client';

@Injectable()
export class EventsService {
    constructor(private prisma: PrismaService) { }

    async getUpcomingEvents(limit = 6) {
        const now = new Date();

        return this.prisma.event.findMany({
            where: {
                status: EventStatus.PUBLISHED,
                startsAt: {
                    gte: now,
                },
            },
            include: {
                region: {
                    select: {
                        nameUz: true,
                        slug: true,
                    },
                },
                district: {
                    select: {
                        nameUz: true,
                        slug: true,
                    },
                },
            },
            orderBy: {
                startsAt: 'asc',
            },
            take: limit,
        });
    }

    async getEventBySlug(slug: string) {
        const event = await this.prisma.event.findUnique({
            where: { slug },
            include: {
                region: {
                    select: {
                        nameUz: true,
                        slug: true,
                    },
                },
                district: {
                    select: {
                        nameUz: true,
                        slug: true,
                    },
                },
            },
        });

        return event;
    }

    async incrementView(slug: string) {
        await this.prisma.event.updateMany({
            where: { slug },
            data: { viewCount: { increment: 1 } },
        });
    }

    async getAllEvents(filters?: {
        regionId?: string;
        status?: EventStatus;
        upcoming?: boolean;
        past?: boolean;
        allStatuses?: boolean;
    }) {
        const where: any = {};

        if (filters?.regionId) {
            where.regionId = filters.regionId;
        }

        if (!filters?.allStatuses) {
            if (filters?.status) {
                where.status = filters.status;
            } else {
                where.status = EventStatus.PUBLISHED;
            }
        }

        if (filters?.upcoming) {
            where.startsAt = { gte: new Date() };
        } else if (filters?.past) {
            where.startsAt = { lt: new Date() };
        }

        return this.prisma.event.findMany({
            where,
            include: {
                region: {
                    select: {
                        nameUz: true,
                        slug: true,
                    },
                },
                district: {
                    select: {
                        nameUz: true,
                        slug: true,
                    },
                },
            },
            orderBy: {
                startsAt: 'asc',
            },
        });
    }

    async createEvent(data: any) {
        return this.prisma.event.create({
            data: {
                title: data.title,
                slug: data.slug,
                description: data.description || null,
                regionId: data.regionId,
                districtId: data.districtId || null,
                addressText: data.addressText || null,
                mapUrl: data.mapUrl || null,
                startsAt: new Date(data.startsAt),
                endsAt: data.endsAt ? new Date(data.endsAt) : null,
                organizerName: data.organizerName,
                contactTelegram: data.contactTelegram || null,
                prizePool: data.prizePool || null,
                rules: data.rules || null,
                status: data.status === 'PUBLISHED' ? EventStatus.PUBLISHED : EventStatus.DRAFT,
            },
            include: {
                region: true,
                district: true,
            },
        });
    }

    async updateEvent(id: string, data: any) {
        const updateData: any = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.slug !== undefined) updateData.slug = data.slug;
        if (data.description !== undefined) updateData.description = data.description || null;
        if (data.regionId !== undefined) updateData.regionId = data.regionId;
        if (data.districtId !== undefined) updateData.districtId = data.districtId || null;
        if (data.addressText !== undefined) updateData.addressText = data.addressText || null;
        if (data.mapUrl !== undefined) updateData.mapUrl = data.mapUrl || null;
        if (data.startsAt !== undefined) updateData.startsAt = new Date(data.startsAt);
        if (data.endsAt !== undefined) updateData.endsAt = data.endsAt ? new Date(data.endsAt) : null;
        if (data.organizerName !== undefined) updateData.organizerName = data.organizerName;
        if (data.contactTelegram !== undefined) updateData.contactTelegram = data.contactTelegram || null;
        if (data.prizePool !== undefined) updateData.prizePool = data.prizePool || null;
        if (data.rules !== undefined) updateData.rules = data.rules || null;
        if (data.status !== undefined) updateData.status = data.status;

        return this.prisma.event.update({
            where: { id },
            data: updateData,
            include: {
                region: true,
                district: true,
            },
        });
    }

    async publishEvent(id: string) {
        return this.prisma.event.update({
            where: { id },
            data: {
                status: EventStatus.PUBLISHED,
                publishedAt: new Date(),
            },
        });
    }

    async deleteEvent(id: string) {
        return this.prisma.event.delete({
            where: { id },
        });
    }
}
