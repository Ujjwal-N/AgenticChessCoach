# AgenticChessCoach

**AgenticChessCoach** is an AI-powered chess analysis platform that uses LLMs to identify strategic gaps and patterns in your play, going beyond move-by-move analysis to surface fundamental understanding issues.

## The Problem

Current chess analysis tools are outdated. They focus on specific mistakes and move combinations instead of general strategy. For example, an existing analysis tool will highlight a mistake you made last Tuesday, without pointing out the fact that your overall strategy was wrong because you did not have an understanding of the position.

## The Solution

AgenticChessCoach solves this by incorporating LLMs into the flow for analyzing games and surfacing gaps in strategic understanding. This project uses parallel agents to analyze a large number of a user's chess games and save those insights in long-term memory. Once it has a general idea of a user's play, it smartly analyzes other games for similarities and generates an in-depth report quickly.

For the hackathon, we built an onboarding flow for the rest of the project, focusing on channeling useful insights quickly and encouraging the user to try the rest of the app.

## Features

- **Strategic Analysis**: Uses LLMs to identify patterns and strategic gaps, not just tactical mistakes
- **Parallel Processing**: Analyzes multiple games simultaneously using Vercel Workflows
- **Long-term Memory**: Stores insights in MongoDB to build comprehensive player profiles over time
- **Pattern Recognition**: Identifies games with similar thematic elements to surface recurring issues
- **Synthesized Insights**: Generates in-depth reports combining analysis across multiple games
- **Real-time Updates**: Polls for analysis completion and updates the UI automatically

## Future Enhancements

One missing component is integrating a deterministic chess engine like Stockfish to verify the LLM's advice. The combination of a non-deterministic LLM and a deterministic engine for evaluating chess positions will lead to the most powerful chess analysis tool ever.

## Broader Applications

This problem can be generalized beyond LLMs. LLMs are very good at consuming data and analyzing human cognitive processes and intentions. If this model works for chess, it can work for any strategy game, and eventually work for any domain where a human's cognitive process needs to be analyzed and improved. Chess is the perfect starting point for this, as all state is neatly encoded as a sequence of moves.

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
- **MongoDB** - Database for game and analysis storage (long-term memory)
- **Google Gemini AI** - Game analysis and strategic insight generation
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
