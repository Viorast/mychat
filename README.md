# tmachat - AI Chat Application with RAG

A Next.js-based AI chat application with Retrieval-Augmented Generation (RAG) capabilities, powered by OpenRouter.ai and PostgreSQL.

## Features

- 💬 Real-time streaming AI responses
- 🗃️ Persistent chat history with PostgreSQL
- 🔍 Context-aware responses using RAG (company data integration)
- 🖼️ Multimodal support (text + images)
- 📊 Admin panel for chat history management
- 🎨 Modern, responsive UI

## Database Setup

### Prerequisites

- PostgreSQL 12 or higher
- Node.js 18 or higher

### 1. Create Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE tmachat_app;

# Exit psql
\q
```

### 2. Apply Schema

Connect to the database and run the SQL schema that was provided (users, chats, messages, chat_groups tables).

### 3. Verify Database

```bash
npm run verify-db
```

This will check:
- ✅ Database connection
- ✅ Required tables exist
- ✅ Default user and group are created
- ✅ Indexes are properly set up

## Environment Variables

Create a `.env.local` file (or update `.env`):

```env
# Application Database (READ-WRITE)
APP_DATABASE_URL=postgresql://postgres:root@localhost:5432/tmachat_app

# Company Data Database (READ-ONLY)
DATABASE_URL=postgresql://postgres:root@localhost:5432/tmachat_local

# OpenRouter AI
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

## Development

```bash
# Install dependencies
npm install

# Verify database setup
npm run verify-db

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## API Endpoints

### Chat Management

- `GET /api/chat?userId={userId}` - Get all chats for user
- `POST /api/chat` - Create new chat
  ```json
  { "title": "Chat Title", "userId": "..." }
  ```
- `GET /api/chat/[chatId]` - Get specific chat with messages
- `PUT /api/chat/[chatId]` - Update chat title
- `DELETE /api/chat/[chatId]` - Delete chat (soft delete)

### Messages

- `POST /api/chat/[chatId]/message` - Send message to chat
  ```json
  { 
    "message": "Your question here",
    "image": { "base64": "...", "mimeType": "..." }
  }
  ```

### Admin Endpoints (Development)

- `GET /api/admin/history?userId={userId}` - View all chats with stats
- `DELETE /api/admin/history?userId={userId}` - Clear user's chat history
- `DELETE /api/admin/history?clearAll=true` - ⚠️ Clear ALL history
- `GET /api/admin/history/[chatId]` - View specific chat details
- `DELETE /api/admin/history/[chatId]` - Delete specific chat

#### Example: Clear Development History

```bash
# Clear all chats for default user
curl -X DELETE "http://localhost:3000/api/admin/history?userId=00000000-0000-0000-0000-000000000001"

# View history stats
curl "http://localhost:3000/api/admin/history?userId=00000000-0000-0000-0000-000000000001"
```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL with soft delete support
- **AI**: OpenRouter.ai (DeepSeek model)
- **RAG**: Custom implementation with vector store
- **Styling**: Tailwind CSS

## Project Structure

```
tmachat/
├── app/
│   ├── api/
│   │   ├── chat/           # Chat CRUD operations
│   │   └── admin/          # Admin endpoints
│   └── chat/               # Chat UI pages
├── lib/
│   ├── storage/
│   │   └── database.js     # PostgreSQL storage layer
│   ├── database/
│   │   ├── connection.js   # Read-only DB (company data)
│   │   └── app-connection.js # Read-write DB (chats)
│   ├── ai/                 # AI streaming handlers
│   └── rag/                # RAG implementation
└── scripts/
    └── verify-database.js  # Database verification tool
```

## Default User

The application uses a default user for development:
- **UUID**: `00000000-0000-0000-0000-000000000001`
- **Email**: rizkykusramdani@tmachat.com
- **Name**: Rizky Kusramdani

## Learn More

To learn more about Next.js:

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

## License

This project is private and proprietary.
