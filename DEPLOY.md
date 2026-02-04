# Render.com ga Deploy qilish

## 1. Render.com da yangi Web Service yaratish

1. [Render.com](https://render.com) ga kiring
2. **New +** → **Web Service** ni tanlang
3. GitHub repository'ni ulang

## 2. Sozlamalar

### Build & Deploy Settings:
- **Name**: `otbozor-api`
- **Region**: `Frankfurt (EU Central)` yoki `Singapore`
- **Branch**: `main`
- **Root Directory**: `horse-backend`
- **Environment**: `Node`
- **Build Command**: 
  ```bash
  npm ci && npm run build && npx prisma migrate deploy
  ```
- **Start Command**: 
  ```bash
  npm run start:prod
  ```

### Environment Variables:

Quyidagi environment variable'larni qo'shing:

```bash
# Database (Render PostgreSQL dan avtomatik)
DATABASE_URL=<Render PostgreSQL connection string>

# JWT (Generate qiling)
JWT_SECRET=<random-secret-key-32-characters>
JWT_REFRESH_SECRET=<random-secret-key-32-characters>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Telegram Bot
TELEGRAM_BOT_TOKEN=<your-telegram-bot-token>
TELEGRAM_BOT_USERNAME=<your-bot-username>

# App URLs
PORT=5000
NODE_ENV=production
APP_URL=<your-frontend-url>
API_URL=<your-render-backend-url>
```

## 3. PostgreSQL Database yaratish

1. Render Dashboard → **New +** → **PostgreSQL**
2. **Name**: `otbozor-db`
3. **Database**: `otbozor`
4. **User**: `otbozor`
5. **Region**: Backend bilan bir xil region tanlang
6. **Plan**: `Free`

Database yaratilgandan keyin:
- **Internal Database URL** ni nusxalang
- Backend service'da `DATABASE_URL` environment variable'ga qo'ying

## 4. Deploy qilish

1. **Create Web Service** tugmasini bosing
2. Render avtomatik build va deploy qiladi
3. Deploy tugagach, URL paydo bo'ladi: `https://otbozor-api.onrender.com`

## 5. Prisma Migration

Birinchi deploy'dan keyin:

```bash
# Local'dan migration'larni deploy qiling
npx prisma migrate deploy
```

Yoki Render Shell'dan:
1. Service → **Shell** tab
2. Quyidagi commandni bajaring:
```bash
npx prisma migrate deploy
```

## 6. Seed Data (ixtiyoriy)

Agar boshlang'ich ma'lumotlar kerak bo'lsa:

```bash
npm run prisma:seed
```

## 7. Frontend'ni yangilash

Frontend `.env.local` faylida:

```bash
NEXT_PUBLIC_API_URL=https://otbozor-api.onrender.com
```

## 8. CORS sozlash

Backend `main.ts` da CORS sozlamalari:

```typescript
app.enableCors({
    origin: process.env.APP_URL || 'http://localhost:3000',
    credentials: true,
});
```

`APP_URL` environment variable'ga frontend URL'ni qo'ying.

## Muhim eslatmalar:

- ✅ Free plan'da service 15 daqiqa ishlatilmasa uxlaydi
- ✅ Birinchi request 30-50 soniya davom etishi mumkin
- ✅ PostgreSQL free plan: 1GB storage, 90 kun keyin o'chiriladi
- ✅ Uploads uchun S3/Cloudinary ishlatish tavsiya etiladi
- ✅ Environment variable'larni `.env` faylga qo'ymang (gitignore)

## Troubleshooting:

### Build xatosi:
```bash
# Logs'ni tekshiring
# Render Dashboard → Service → Logs
```

### Database connection xatosi:
```bash
# DATABASE_URL to'g'ri ekanligini tekshiring
# Internal Database URL ishlatilganligini tasdiqlang
```

### Prisma xatosi:
```bash
# Prisma generate va migrate deploy bajarilganligini tekshiring
npm run build
```
