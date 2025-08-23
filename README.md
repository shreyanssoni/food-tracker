# Nourish - AI Food & Mood Tracker

A mobile-first Progressive Web App (PWA) that helps users track their meals, get nutritional insights, and receive personalized suggestions powered by AI. Built with Next.js 14, Tailwind CSS, Supabase, and Google's Gemini API.

## Features

- **Food Logging**: Log meals using natural language or photos
- **AI-Powered Analysis**: Get detailed nutritional information using AI
- **Personalized Suggestions**: Receive meal recommendations based on your preferences and history
- **Mood Tracking**: Track how different foods affect your mood and energy levels
- **Responsive Design**: Works seamlessly on mobile and desktop devices
- **Offline Support**: Log meals even without an internet connection
- **Secure Authentication**: Google OAuth integration with NextAuth.js

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS with custom animations
- **State Management**: React Context API + React Query
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: NextAuth.js with Google OAuth
- **AI**: Google Gemini API
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- Supabase account
- Google Cloud Project with Gemini API enabled
- Google OAuth credentials

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/your-username/food-tracker.git
   cd food-tracker
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables
   - Copy `.env.example` to `.env.local`
   - Fill in all required environment variables

4. Set up the database
   - Run the SQL schema from `config/supabase.sql` in your Supabase SQL editor
   - Enable Row Level Security (RLS) on all tables

5. Start the development server
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key

# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database Schema

Run the SQL file located at `config/supabase.sql` to set up the required database tables and relationships.

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the application for production
- `npm start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run check-types` - Check TypeScript types

## Deployment

The easiest way to deploy this application is to use [Vercel](https://vercel.com):

1. Push your code to a GitHub/GitLab/Bitbucket repository
2. Import the repository to Vercel
3. Add all required environment variables
4. Deploy!

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google Gemini API Documentation](https://ai.google.dev/)
4. Open http://localhost:3000

## Deploy on Vercel
- Push to GitHub and import the repo in Vercel
- Add env vars above in Vercel Project Settings
- No extra config needed

## Supabase Schema
See `config/supabase.sql` to create tables. Run in Supabase SQL editor.

## Features
- Food logging via text or photo
- Empathetic AI responses and suggestions
- Habit prompts at mealtimes
- Auth with Supabase
- PWA installable with offline caching

## Tech
- Next.js App Router, API Routes
- Tailwind CSS
- Supabase (Auth + Postgres)
- Gemini API for NLP and vision

## Notes
- This is an educational starter. Review prompts and adjust for your locale and dietary context.
