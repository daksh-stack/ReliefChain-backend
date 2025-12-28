# ReliefChain Backend

Disaster Relief Distribution Tracker - Backend API with Priority Queue System

## Tech Stack

- **Node.js + Express** - REST API
- **MongoDB** - Database
- **Socket.io** - Real-time updates
- **Redis** (optional) - Queue persistence

## Local Development

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your MongoDB URI

# Start dev server
npm run dev
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 5000) |
| `NODE_ENV` | Environment | No (default: development) |
| `MONGODB_URI` | MongoDB connection string | **Yes** |
| `JWT_SECRET` | JWT signing secret | **Yes** |
| `FRONTEND_URL` | Frontend URL for CORS | **Yes** |
| `REDIS_URL` | Redis connection string | No (uses in-memory) |

## Deploy to Render

### Option 1: Blueprint (Recommended)

1. Go to [render.com](https://render.com) and sign in
2. Click "New" → "Blueprint"
3. Connect your GitHub repository: `daksh-stack/ReliefChain-backend`
4. Render will detect `render.yaml` and configure automatically
5. Set the required environment variables in the dashboard:
   - `MONGODB_URI` - Your MongoDB Atlas connection string
   - `FRONTEND_URL` - Your Vercel frontend URL (e.g., `https://reliefchain.vercel.app`)

### Option 2: Manual Setup

1. Click "New" → "Web Service"
2. Connect your repository
3. Configure:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add environment variables

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/request` | Submit relief request |
| GET | `/api/queue` | View priority queue |
| POST | `/api/dequeue` | Get highest priority |
| PUT | `/api/update-status/:id` | Update request status |
| GET | `/api/my-requests` | Get user's requests |
| GET | `/api/stats` | Admin statistics |
| GET | `/health` | Health check |

## MongoDB Atlas Setup

1. Create account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a free cluster
3. Create a database user
4. Add IP `0.0.0.0/0` to network access (allows Render)
5. Get connection string and add to environment variables
