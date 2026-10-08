# 🤖 AI-MEET — AI Meeting Operator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/shreyas026/AI-MEET/actions/workflows/ci.yml/badge.svg)](https://github.com/shreyas026/AI-MEET/actions)
[![Stars](https://img.shields.io/github/stars/shreyas026/AI-MEET?style=social)](https://github.com/shreyas026/AI-MEET/stargazers)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://typescriptlang.org)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.0+-purple.svg)](https://tanstack.com/start)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green.svg)](https://supabase.com)

**AI-powered meeting assistant with real-time transcription, summarization, action item extraction, and intelligent follow-ups. Built with TanStack Start, Supabase, and Google Gemini.**

---

## 🎯 Features

- 🎙️ **Real-time Transcription** — Live speech-to-text during meetings
- 📝 **Smart Summarization** — AI-generated meeting summaries with key points
- ✅ **Action Item Extraction** — Automatic task detection and assignment
- 🔍 **Semantic Search** — Query past meetings with natural language
- 📊 **Analytics Dashboard** — Meeting insights, participation stats, trends
- 🔐 **Secure & Private** — Supabase Row Level Security, end-to-end encryption
- 🌐 **Real-time Collaboration** — Multi-user editing, comments, mentions

---

## 🏗️ Architecture

`
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│  TanStack    │────▶│  Supabase   │
│  (React)    │     │   Start      │     │  (Postgres) │
└─────────────┘     └──────────────┘     └─────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌─────────────┐
                    │   Gemini AI  │     │  Realtime   │
                    │  (Summarize) │     │  Subscriptions
                    └──────────────┘     └─────────────┘
`

### Tech Stack
| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, TanStack Start, Tailwind CSS |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **AI/ML** | Google Gemini API (1.5 Pro/Flash) |
| **Deployment** | Vercel (Frontend), Supabase Cloud |
| **CI/CD** | GitHub Actions |

---

## 📁 Project Structure

`
AI-MEET/
├── frontend/           # TanStack Start React application
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── routes/     # File-based routing
│   │   ├── hooks/      # Custom React hooks
│   │   ├── lib/        # Utilities, API clients
│   │   └── styles/     # Global styles, Tailwind
│   ├── package.json
│   └── tsconfig.json
├── backend/            # Supabase schema & config
│   ├── migrations/     # Database migrations
│   ├── functions/      # Edge functions
│   └── seed/           # Seed data
├── .github/workflows/  # CI/CD pipelines
└── README.md
`

---

## ⚙️ Quick Start

### Prerequisites
- Node.js 20+
- Supabase account
- Google AI Studio API key

### 1. Clone & Install
`ash
git clone https://github.com/shreyas026/AI-MEET.git
cd AI-MEET/frontend
npm install
`

### 2. Environment Variables
Create rontend/.env:
`env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_GEMINI_API_KEY=your_gemini_key
`

### 3. Database Setup
`ash
# In backend/
supabase db push
# Or run migrations manually
`

### 4. Run Development
`ash
npm run dev
`
Open http://localhost:3000

---

## 🧪 Testing & Quality

`ash
# Lint
npm run lint

# Type check
npm run typecheck

# Test
npm test

# Build
npm run build
`

---

## 📦 Deployment

### Frontend (Vercel)
1. Connect GitHub repo to Vercel
2. Add environment variables
3. Deploy automatically on push to main

### Backend (Supabase)
`ash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy
`

---

## 🤝 Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 License
MIT License — see [LICENSE](LICENSE)

---

## 🙏 Acknowledgments
- [TanStack Start](https://tanstack.com/start) for the amazing full-stack framework
- [Supabase](https://supabase.com) for backend-as-a-service
- [Google Gemini](https://ai.google.dev) for AI capabilities
