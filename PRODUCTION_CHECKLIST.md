# Production Checklist ✅

## Render.com Environment Variables

Quyidagi barcha variable'lar to'g'ri sozlanganligini tekshiring:

### ✅ Database
- [ ] `DATABASE_URL` - PostgreSQL connection string (Render'dan avtomatik)

### ✅ JWT Secrets
- [ ] `JWT_SECRET` - 32+ characters random string
- [ ] `JWT_REFRESH_SECRET` - 32+ characters random string (JWT_SECRET'dan farqli)
- [ ] `JWT_EXPIRES_IN` - `15m`
- [ ] `JWT_REFRESH_EXPIRES_IN` - `7d`

### ✅ Telegram Bot
- [ ] `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- [ ] `TELEGRAM_BOT_USERNAME` - Bot username (without @)

### ✅ URLs
- [ ] `PORT` - `5000`
- [ ] `NODE_ENV` - `production`
- [ ] `APP_URL` - **Frontend URL** (https://horse-frontend-khaki.vercel.app)
- [ ] `API_URL` - **Backend URL** (https://horse-backend-8rok.onrender.com)

## Potensial Muammolar va Yechimlar

### 1. ❌ CORS xatosi
**Sabab:** `APP_URL` noto'g'ri yoki yo'q
**Yechim:** `APP_URL=https://horse-frontend-khaki.vercel.app`

### 2. ❌ Database connection xatosi
**Sabab:** `DATABASE_URL` noto'g'ri
**Yechim:** Render PostgreSQL'dan **Internal Database URL** ni nusxalang

### 3. ❌ JWT xatosi
**Sabab:** `JWT_SECRET` yo'q yoki juda qisqa
**Yechim:** 32+ characters random string generate qiling

### 4. ❌ Telegram bot ishlamayapti
**Sabab:** Bot token noto'g'ri yoki bot o'chirilgan
**Yechim:** @BotFather'dan yangi token oling

### 5. ❌ Uploads ko'rinmayapti
**Sabab:** Render ephemeral storage (har deploy'da o'chadi)
**Yechim:** S3/Cloudinary ishlatish kerak (keyinroq)

### 6. ❌ Service uxlab qoladi (Free plan)
**Sabab:** 15 daqiqa ishlatilmasa uxlaydi
**Yechim:** 
- Paid plan ($7/month)
- Yoki cron job bilan har 10 daqiqada ping qilish
- Yoki UptimeRobot ishlatish (bepul)

### 7. ❌ Slow first request
**Sabab:** Service uxlab qolgan, cold start
**Yechim:** Normal, 30-50 soniya kutish kerak

### 8. ❌ Migration xatosi
**Sabab:** Prisma migration bajarilmagan
**Yechim:** 
```bash
# Render Shell'da
npx prisma migrate deploy
```

## Frontend (Vercel) Checklist

### ✅ Environment Variables
- [ ] `NEXT_PUBLIC_API_URL` - `https://horse-backend-8rok.onrender.com`

### ✅ Build Settings
- [ ] Framework: Next.js
- [ ] Root Directory: `horse-frontend`
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `.next`

## Testing Checklist

### Backend
- [ ] Health check: `https://horse-backend-8rok.onrender.com/api`
- [ ] Swagger docs: `https://horse-backend-8rok.onrender.com/api/docs`
- [ ] CORS test: Frontend'dan API request

### Frontend
- [ ] Homepage yuklanyapti
- [ ] API requests ishlayapti
- [ ] Images ko'rinyapti
- [ ] Login/Register ishlayapti

## Security Checklist

- [ ] JWT secrets random va xavfsiz
- [ ] CORS faqat kerakli origin'larni qabul qiladi
- [ ] Environment variables `.env` faylda emas (gitignore)
- [ ] Database password kuchli
- [ ] Helmet middleware yoqilgan
- [ ] Rate limiting yoqilgan (throttler)

## Performance Checklist

- [ ] Database indexes mavjud
- [ ] Image optimization (Next.js automatic)
- [ ] Static files caching
- [ ] Gzip compression (Render/Vercel automatic)

## Monitoring

### Logs
- **Render:** Dashboard → Service → Logs
- **Vercel:** Dashboard → Project → Deployments → Logs

### Errors
- Sentry.io (ixtiyoriy, keyinroq)
- LogRocket (ixtiyoriy, keyinroq)

### Uptime
- UptimeRobot.com (bepul)
- Pingdom (pullik)

## Backup

### Database
- Render free plan: 90 kun keyin o'chiriladi
- **Muhim:** Muntazam backup oling!
- Render Dashboard → Database → Backups

### Code
- GitHub repository (already done ✅)
- Private backup (ixtiyoriy)

## Next Steps

1. Custom domain qo'shish (otbozor.uz)
2. S3/Cloudinary uchun file uploads
3. Email notifications (SendGrid, Resend)
4. Analytics (Google Analytics, Plausible)
5. Error tracking (Sentry)
6. Monitoring (UptimeRobot)
7. SEO optimization
8. Performance optimization
9. Security audit
10. Load testing

## Support

Muammo bo'lsa:
- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- NestJS Docs: https://docs.nestjs.com
- Next.js Docs: https://nextjs.org/docs
