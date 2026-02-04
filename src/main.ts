import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as path from 'path';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Security
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    app.use(cookieParser());

    // CORS
    app.enableCors({
        origin: process.env.APP_URL || 'http://localhost:3000',
        credentials: true,
    });

    // Serve static files (uploads)
    // const uploadsPath = path.join(process.cwd(), 'uploads');
    // app.useStaticAssets(uploadsPath, {
    //     prefix: '/uploads',
    // });

    // Validation
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    // API prefix
    app.setGlobalPrefix('api');

    // Swagger
    if (process.env.NODE_ENV !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('Otbozor API')
            .setDescription("O'zbekiston Ot Savdo Platformasi API")
            .setVersion('1.0')
            .addBearerAuth()
            .addCookieAuth('accessToken')
            .build();
        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api/docs', app, document);
    }

    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(`Otbozor API running on http://localhost:${port}`);
    console.log(`Swagger docs: http://localhost:${port}/api/docs`);
    console.log(`Uploads: http://localhost:${port}/uploads`);
}

bootstrap();
