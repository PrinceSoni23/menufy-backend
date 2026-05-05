# AR Menu Platform - Backend API

Node.js + Express + TypeScript + MongoDB

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

Copy `.env.example` to `.env.local` and update with your credentials:

```bash
cp .env.example .env.local
```

**Required Services:**

- MongoDB Atlas (free tier available)
- Cloudinary (free tier available)
- Tripo AI (free tier: 100 conversions/month)

### 3. Development Server

```bash
npm run dev
```

Server runs on `http://localhost:5000` with auto-reload

### 4. Build for Production

```bash
npm run build
npm start
```

---

## Project Structure

```
src/
├── server.ts              # Express app entry point
├── config/                # Configuration files
│   ├── database.ts        # MongoDB connection
│   ├── constants.ts       # App-wide constants
│   └── index.ts
├── models/                # Mongoose schemas
│   ├── User.ts
│   ├── Restaurant.ts
│   ├── MenuItem.ts
│   ├── QRCode.ts
│   ├── ConversionJob.ts
│   ├── Analytics.ts
│   └── index.ts
├── controllers/           # Route handlers
│   ├── auth.controller.ts
│   ├── restaurant.controller.ts
│   ├── menu.controller.ts
│   ├── conversion.controller.ts
│   ├── qr.controller.ts
│   ├── analytics.controller.ts
│   └── index.ts
├── services/              # Business logic
│   ├── auth.service.ts
│   ├── restaurant.service.ts
│   ├── menu.service.ts
│   ├── image-to-3d.service.ts
│   ├── qr.service.ts
│   ├── cloudinary.service.ts
│   ├── email.service.ts
│   ├── analytics.service.ts
│   └── index.ts
├── routes/                # API route definitions
│   ├── auth.routes.ts
│   ├── restaurant.routes.ts
│   ├── menu.routes.ts
│   ├── conversion.routes.ts
│   ├── qr.routes.ts
│   ├── public.routes.ts
│   ├── analytics.routes.ts
│   └── index.ts
├── middleware/            # Express middleware
│   ├── auth.middleware.ts
│   ├── errorHandler.ts
│   ├── validation.ts
│   ├── requestLogger.ts
│   ├── rateLimiter.ts
│   └── index.ts
├── types/                 # TypeScript type definitions
│   └── index.ts
├── utils/                 # Utility functions
│   ├── logger.ts
│   ├── validators.ts
│   ├── jwt.ts
│   ├── helpers.ts
│   └── index.ts
└── workers/               # Background jobs
    └── conversion-worker.ts
```

---

## Key Features

### ✅ Phase 1 (MVP)

- User authentication (JWT)
- Restaurant CRUD
- Menu item management
- Image upload (Cloudinary)
- Automatic 2D→3D conversion (Tripo AI)
- QR code generation
- Public menu API

### ⏳ Phase 2 (AR)

- AR viewer configuration
- Model optimization

### ⏳ Phase 3 (Analytics & Scale)

- Analytics dashboard
- Performance optimization
- Monitoring

---

## API Endpoints (Coming)

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/verify`

### Restaurants

- `GET /api/restaurants`
- `POST /api/restaurants`
- `GET /api/restaurants/:id`
- `PUT /api/restaurants/:id`
- `DELETE /api/restaurants/:id`

### Menu Items

- `GET /api/restaurants/:id/menu`
- `POST /api/restaurants/:id/menu`
- `GET /api/restaurants/:id/menu/:itemId`
- `PUT /api/restaurants/:id/menu/:itemId`
- `DELETE /api/restaurants/:id/menu/:itemId`

### Public Menu

- `GET /api/public/menu/:qrCode`
- `GET /api/public/menu/:qrCode/:dishId`
- `POST /api/public/analytics/:qrCode`

---

## Development

### Commands

```bash
# Development server with auto-reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build

# Production start
npm start
```

### Debugging

Set `LOG_LEVEL=debug` in `.env.local` for verbose logging

---

## Environment Variables

See `.env.example` for all available variables.

Key variables:

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for signing JWTs
- `CLOUDINARY_*` - Cloudinary credentials
- `TRIPO_API_KEY` - Tripo AI API key
- `CORS_ORIGIN` - Allowed frontend origins

---

## Database

MongoDB collections:

- `users` - Restaurant owners
- `restaurants` - Restaurant information
- `menuitems` - Menu items with images
- `qrcodes` - QR code metadata
- `conversionjobs` - 2D→3D conversion status
- `analytics` - User interaction tracking

---

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "error_code (development only)"
}
```

---

## Security

- HTTPS in production
- CORS configured
- Rate limiting on all endpoints
- JWT authentication
- Password hashing (bcrypt)
- Input validation
- Error details hidden in production

---

## Deployment

### Railway (Recommended for MVP)

1. Connect GitHub repo
2. Set environment variables
3. Deploy (auto on push)

### Heroku / Vercel / Others

Similar setup with environment variables

---

## Support

For issues or questions, check:

- `/logs/error.log` - Error logs
- `/logs/combined.log` - All logs
- `.env.local` - Environment configuration

---

**Next Steps:** Database models and authentication system
