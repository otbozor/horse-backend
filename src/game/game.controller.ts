import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GameKind, GamePeriod, GameService } from './game.service';

class ScoreDto {
    @IsString() @MaxLength(4096)
    initData: string;

    @IsIn(['race', 'kopkari'])
    kind: GameKind;

    @IsNumber() @Min(0) @Max(1000)
    value: number;

    // O'yin qo'shimcha ma'lumot yuboradi (hozircha saqlanmaydi)
    @IsOptional() @IsString() @MaxLength(32) horse?: string;
    @IsOptional() @IsString() @MaxLength(16) theme?: string;
    @IsOptional() @IsBoolean() hurdles?: boolean;
    @IsOptional() daily?: string | number;
}

class TopQuery {
    @IsOptional() @IsIn(['race', 'kopkari'])
    kind?: GameKind;

    @IsOptional() @IsIn(['week', 'month'])
    period?: GamePeriod;

    @IsOptional() @IsString() @MaxLength(20)
    me?: string;
}

@ApiTags("O'yin: Otbozor Poyga reytingi")
@Controller('game')
export class GameController {
    constructor(private readonly game: GameService) { }

    @Get('top')
    @ApiOperation({ summary: 'Haftalik / oylik reyting (eng yaxshi 20 ta)' })
    top(@Query() q: TopQuery) {
        return this.game.top(q.kind || 'race', q.period || 'week', q.me);
    }

    @Post('score')
    @HttpCode(200)
    @ApiOperation({ summary: "Natija yuborish (Telegram initData bilan tekshiriladi)" })
    score(@Body() b: ScoreDto) {
        return this.game.submit(b.initData, b.kind, b.value);
    }
}
