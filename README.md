# Chess Game Analysis Platform

A Next.js application that analyzes chess games from Lichess using AI to provide insights into player strengths, weaknesses, and playing patterns.

## Features

- **Game Analysis**: Fetches and analyzes chess games from Lichess API
- **AI-Powered Insights**: Uses Google Gemini AI to analyze games and identify patterns
- **Player Profile**: Synthesizes analysis across multiple games to create comprehensive player profiles
- **Look-Alike Detection**: Identifies games with similar thematic elements to original games
- **Real-time Updates**: Polls for analysis completion and updates the UI automatically

## Prerequisites

- Node.js 18+ 
- MongoDB Atlas account
- Google Gemini API key
- Lichess account (for testing)

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd main_project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment variables**
   
   Create a `.env.local` file in the root directory with the following variables:
   ```env
   MONGODB_USERNAME=your_mongodb_username
   MONGODB_PASSWORD=your_mongodb_password
   GEMINI_API_KEY=your_gemini_api_key
   ```

   **Note**: The `.env*` files are gitignored and will not be committed to the repository.

4. **Test MongoDB connection** (optional)
   ```bash
   # Start the dev server first, then visit:
   http://localhost:3000/api/test-mongodb
   ```

## Running the Application

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## How It Works

1. **Enter a Lichess username** in the input field
2. **Fetch games**: The app fetches up to 100 games from the last 2 months
3. **Select games**: Automatically selects 25 games (10 wins, 10 losses, 5 draws) for analysis
4. **Analyze games**: Uses Vercel Workflows to analyze each game with Gemini AI in parallel
5. **Synthesize profile**: After 3+ games are analyzed, creates a comprehensive player profile
6. **Find look-alikes**: After 10 games, identifies games with similar thematic patterns

## Technology Stack

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **MongoDB** - Database for game and analysis storage
- **Google Gemini AI** - Game analysis and synthesis
- **Vercel Workflows** - Background job processing with automatic retries
- **Tailwind CSS** - Styling
- **React Markdown** - Rendering analysis text

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── games/          # Fetch games from Lichess
│   │   ├── check-analysis/  # Poll for analysis status
│   │   ├── user-analysis/   # Get synthesized user profile
│   │   └── test-mongodb/    # Test database connection
│   ├── page.tsx             # Main UI component
│   └── layout.tsx           # Root layout
├── lib/
│   ├── mongodb.ts           # Database connection
│   ├── schemas.ts           # Data models
│   └── workflows/
│       ├── analyze-game.ts           # Analyze individual games
│       ├── synthesize-user-analysis.ts # Create player profile
│       └── lookalike-games.ts         # Find similar games
```

## API Endpoints

- `GET /api/games?username=<username>` - Fetch and start analyzing games
- `GET /api/check-analysis?username=<username>` - Check analysis progress
- `GET /api/user-analysis?username=<username>` - Get synthesized player profile
- `GET /api/test-mongodb` - Test MongoDB connection

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_USERNAME` | MongoDB Atlas username | Yes |
| `MONGODB_PASSWORD` | MongoDB Atlas password | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |

## Notes

- The app analyzes up to 25 games per user
- Analysis happens asynchronously using Vercel Workflows
- The UI polls every 5 seconds for updates
- Each user's data is isolated and stored separately in MongoDB

## License

Private project for hackathon demonstration.
