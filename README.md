# Job Search Engine

A full-stack, multi-portal job search engine with integrated AI matching and automated cover letter generation. 

It simultaneously scrapes 9 different remote job portals (including stealth scraping of Cloudflare-protected portals using a headless Chromium browser) and scores your resume against the job descriptions using Google Gemini AI.

## Features
- **Multi-Portal Search:** Fetches jobs simultaneously from LinkedIn, Remotive, Arbeitnow, RemoteOK, WeWorkRemotely, Indeed, Seek, Jora, and Wellfound.
- **Stealth Scrapers:** Bypasses enterprise bot protections (Cloudflare/DataDome) using `puppeteer-extra-plugin-stealth`.
- **AI Match Scoring:** Compares your local PDF resume against the full job description to generate a 0-100% match score using Gemini AI.
- **Auto Cover Letter Generation:** Generates a professional, tailored cover letter based on your resume and the specific job description.
- **Advanced Filtering:** Filter by Visa Sponsorship, Experience Level, and Date Posted.

## Setup Instructions

### Prerequisites
1. **Node.js** (v18+)
2. **Google Gemini API Key**: Get a free API key from Google AI Studio.
3. Your **Resume** in PDF format.

### 1. Backend Configuration
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install the dependencies (including Puppeteer):
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend/` directory with the following variables:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   RESUME_PATH=/absolute/path/to/your/resume.pdf
   ```
4. Start the backend server:
   ```bash
   node server.js
   ```

### 2. Frontend Configuration
1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev -- --port 8080
   ```
4. Open your browser to `http://localhost:8080`.

## Architecture Notes
- The backend relies on a single, globally-shared headless Chromium browser instance initialized on startup to keep memory usage low while querying heavy React SPAs like Indeed and Seek.
- The `node_modules` and `.env` files are ignored via `.gitignore` to prevent leaking sensitive API keys.
