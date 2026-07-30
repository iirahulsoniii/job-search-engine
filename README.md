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

---

### OS-Specific Setup Notes

#### 🐧 Linux Users (Puppeteer Dependencies)
If you are running this on Linux (e.g., Ubuntu/Debian), Puppeteer requires several system libraries to launch the headless browser. If the backend crashes on startup with a Chrome error, run the following to install the required dependencies:
```bash
sudo apt-get update
sudo apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libnss3 lsb-release xdg-utils wget
```

#### 🪟 Windows Users (Path Formatting)
When setting your `RESUME_PATH` in the `.env` file, ensure you use proper path formatting.
**Correct:** `RESUME_PATH=C:\Users\YourName\Documents\resume.pdf` or `RESUME_PATH=C:/Users/YourName/Documents/resume.pdf`

---

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
   npm run dev -- --port 3000
   ```
4. Open your browser to `http://localhost:3000`.

## Architecture Notes
- The backend relies on a single, globally-shared headless Chromium browser instance initialized on startup to keep memory usage low while querying heavy React SPAs like Indeed and Seek.
- The `node_modules` and `.env` files are ignored via `.gitignore` to prevent leaking sensitive API keys.
