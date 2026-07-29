require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

let cachedResumeText = null;
const resumePath = process.env.RESUME_PATH || '/Users/rahsoni2/Documents/Personal/Rahul Soni_Resume_Latest.pdf';

async function getResumeText() {
    if (cachedResumeText) return cachedResumeText;
    if (fs.existsSync(resumePath)) {
        const dataBuffer = fs.readFileSync(resumePath);
        const pdfData = await pdfParse(dataBuffer);
        cachedResumeText = pdfData.text;
        return cachedResumeText;
    }
    return '';
}

const visaRegex = /visa sponsorship|sponsor visa|h1b|h-1b|h1-b|work permit sponsorship|will sponsor|visa support|visa provided|relocation support|visa and relocation|includes visa|relocation assistance|sponsor/i;
const noVisaRegex = /no visa|not sponsor|not provide visa|visa sponsorship is not available|cannot sponsor|will not sponsor|without sponsorship|unable to sponsor|no sponsorship/i;
const expRegex = /(\d+\+?)\s*(?:-|to)?\s*(\d+)?\s*years?(?:\s+of)?\s+(?:experience|exp)/i;

// Global browser instance
let browser;

async function initBrowser() {
    console.log("Initializing Puppeteer Stealth Browser...");
    browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log("Puppeteer initialized.");
}
initBrowser();

const scrapers = {
    filterByRelevance: async (jobs, keyword, titleKey) => {
        if (!keyword) return jobs;
        let terms = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (terms.length === 0) return jobs;
        
        try {
            const res = await axios.get(`https://api.datamuse.com/words?ml=${encodeURIComponent(keyword)}&max=10`);
            const synonyms = res.data.map(item => item.word.toLowerCase());
            terms = [...new Set([...terms, ...synonyms])];
        } catch(e) {
            console.error('Datamuse error:', e.message);
        }

        return jobs.filter(job => {
            const title = (job[titleKey] || '').toLowerCase();
            return terms.some(term => title.includes(term));
        });
    },
    linkedin: async (keyword, location, timeFilter) => {
        try {
            const url = `https://www.linkedin.com/jobs/search/?keywords=${keyword}&location=${location}${timeFilter}`;
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(response.data);
            let baseJobs = [];
            $('.job-search-card').each((index, element) => {
                const title = $(element).find('h3.base-search-card__title').text().trim();
                const company = $(element).find('h4.base-search-card__subtitle').text().trim();
                const jobLocation = $(element).find('span.job-search-card__location').text().trim();
                let link = $(element).find('a.base-card__full-link').attr('href');
                if (link && link.includes('?')) link = link.split('?')[0];
                const time = $(element).find('time.job-search-card__listdate').text().trim() || 
                             $(element).find('time.job-search-card__listdate--new').text().trim();
                if (title && company) baseJobs.push({ title, company, location: jobLocation, link, time, source: 'LinkedIn' });
            });
            baseJobs = baseJobs.slice(0, 10);
            for (let job of baseJobs) {
                try {
                    const match = job.link.match(/-(\d+)\??/) || job.link.match(/view\/(\d+)/);
                    const jobId = match ? match[1] : null;
                    const targetUrl = jobId ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}` : job.link;
                    const res = await axios.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const $$ = cheerio.load(res.data);
                    job.description = $$('.show-more-less-html__markup').text().trim() || $$('.description__text').text().trim() || $$('body').text().trim() || '';
                } catch(e) { job.description = ''; }
            }
            return baseJobs;
        } catch(e) { return []; }
    },
    remotive: async (keyword, location) => {
        try {
            const response = await axios.get(`https://remotive.com/api/remote-jobs?search=${keyword}&limit=50`);
            let jobs = response.data.jobs || [];
            jobs = await scrapers.filterByRelevance(jobs, keyword, 'title');
            return jobs.slice(0, 10).map(job => {
                const $ = cheerio.load(job.description);
                return {
                    title: job.title,
                    company: job.company_name,
                    location: job.candidate_required_location || 'Remote',
                    link: job.url,
                    time: job.publication_date ? job.publication_date.split('T')[0] : 'Recently',
                    source: 'Remotive',
                    description: $.text().trim()
                };
            });
        } catch(e) { return []; }
    },
    arbeitnow: async (keyword, location) => {
        try {
            const response = await axios.get(`https://www.arbeitnow.com/api/job-board-api`);
            let jobs = response.data.data || [];
            jobs = await scrapers.filterByRelevance(jobs, keyword, 'title');
            return jobs.slice(0, 10).map(job => {
                const $ = cheerio.load(job.description);
                return {
                    title: job.title,
                    company: job.company_name,
                    location: job.location || 'Remote',
                    link: job.url,
                    time: 'Recently',
                    source: 'Arbeitnow',
                    description: $.text().trim()
                };
            });
        } catch(e) { return []; }
    },
    remoteok: async (keyword, location) => {
        try {
            const response = await axios.get(`https://remoteok.com/api?keys=${keyword}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            let jobs = (response.data || []).slice(1);
            jobs = await scrapers.filterByRelevance(jobs, keyword, 'position');
            return jobs.slice(0, 10).map(job => {
                const $ = cheerio.load(job.description);
                return {
                    title: job.position,
                    company: job.company,
                    location: job.location || 'Remote',
                    link: job.url,
                    time: job.date ? job.date.split('T')[0] : 'Recently',
                    source: 'RemoteOK',
                    description: $.text().trim()
                };
            });
        } catch(e) { return []; }
    },
    weworkremotely: async (keyword, location) => {
        try {
            const url = `https://weworkremotely.com/remote-jobs/search?term=${keyword}`;
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(response.data);
            let jobs = [];
            $('.jobs article ul li:not(.view-all)').each((i, el) => {
                const title = $(el).find('.title').text().trim();
                const company = $(el).find('.company').first().text().trim();
                const jobLocation = $(el).find('.region').text().trim() || 'Remote';
                const linkPath = $(el).find('a').attr('href');
                const link = linkPath ? `https://weworkremotely.com${linkPath}` : '';
                const time = $(el).find('.date').text().trim() || 'Recently';
                if (title && company && link) {
                    jobs.push({ title, company, location: jobLocation, link, time, source: 'WeWorkRemotely', description: '' });
                }
            });
            return jobs.slice(0, 10);
        } catch(e) { return []; }
    },
    indeed: async (keyword, location) => {
        if (!browser) return [];
        let page = null;
        try {
            page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
            const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            const jobs = await page.evaluate(() => {
                const results = [];
                document.querySelectorAll('.job_seen_beacon').forEach(card => {
                    const titleEl = card.querySelector('h2.jobTitle span');
                    const companyEl = card.querySelector('[data-testid="company-name"]');
                    const locationEl = card.querySelector('[data-testid="text-location"]');
                    const linkEl = card.querySelector('h2.jobTitle a');
                    if (titleEl && companyEl) {
                        results.push({
                            title: titleEl.innerText.trim(),
                            company: companyEl.innerText.trim(),
                            location: locationEl ? locationEl.innerText.trim() : '',
                            link: linkEl ? linkEl.href : '',
                            time: 'Recently',
                            source: 'Indeed',
                            description: '' // Full description needs secondary scrape, skipped for speed
                        });
                    }
                });
                return results;
            });
            return jobs.slice(0, 10);
        } catch(e) { 
            console.error("Indeed Scraper Error:", e.message);
            return []; 
        } finally {
            if (page) await page.close();
        }
    },
    seek: async (keyword, location) => {
        if (!browser) return [];
        let page = null;
        try {
            page = await browser.newPage();
            const url = `https://www.seek.com.au/${encodeURIComponent(keyword.replace(/ /g, '-'))}-jobs/in-${encodeURIComponent(location.replace(/ /g, '-'))}`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            const jobs = await page.evaluate(() => {
                const results = [];
                document.querySelectorAll('article').forEach(card => {
                    const titleEl = card.querySelector('[data-automation="jobTitle"]');
                    const companyEl = card.querySelector('[data-automation="jobCompany"]');
                    const locationEl = card.querySelector('[data-automation="jobLocation"]');
                    if (titleEl && companyEl) {
                        results.push({
                            title: titleEl.innerText.trim(),
                            company: companyEl.innerText.trim(),
                            location: locationEl ? locationEl.innerText.trim() : '',
                            link: titleEl.href,
                            time: 'Recently',
                            source: 'Seek',
                            description: ''
                        });
                    }
                });
                return results;
            });
            return jobs.slice(0, 10);
        } catch(e) { return []; } finally {
            if (page) await page.close();
        }
    },
    jora: async (keyword, location) => {
        if (!browser) return [];
        let page = null;
        try {
            page = await browser.newPage();
            const url = `https://au.jora.com/j?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            const jobs = await page.evaluate(() => {
                const results = [];
                document.querySelectorAll('.job-card').forEach(card => {
                    const titleEl = card.querySelector('.job-title a');
                    const companyEl = card.querySelector('.job-company');
                    const locationEl = card.querySelector('.job-location');
                    if (titleEl) {
                        results.push({
                            title: titleEl.innerText.trim(),
                            company: companyEl ? companyEl.innerText.trim() : 'Unknown',
                            location: locationEl ? locationEl.innerText.trim() : '',
                            link: titleEl.href,
                            time: 'Recently',
                            source: 'Jora',
                            description: ''
                        });
                    }
                });
                return results;
            });
            return jobs.slice(0, 10);
        } catch(e) { return []; } finally {
            if (page) await page.close();
        }
    }
};

app.get('/api/jobs', async (req, res) => {
    try {
        let keywordRaw = req.query.keyword || 'Software Engineer Java';
        if (req.query.visa === 'true') {
            keywordRaw += ' visa sponsorship';
        }
        
        const keyword = encodeURIComponent(keywordRaw);
        const location = encodeURIComponent(req.query.location || 'Australia');
        const posted = req.query.posted || '24h';
        // Now supporting 8 portals
        const portalsStr = req.query.portals || 'linkedin,remotive,arbeitnow,remoteok,weworkremotely';
        const activePortals = portalsStr.split(',');
        
        let timeFilter = '';
        if (posted === '24h') timeFilter = '&f_TPR=r86400';
        else if (posted === '1w') timeFilter = '&f_TPR=r604800';
        else if (posted === '1m') timeFilter = '&f_TPR=r2592000';
        
        const fetchPromises = [];
        if (activePortals.includes('linkedin')) fetchPromises.push(scrapers.linkedin(keyword, location, timeFilter));
        if (activePortals.includes('remotive')) fetchPromises.push(scrapers.remotive(keywordRaw, location));
        if (activePortals.includes('arbeitnow')) fetchPromises.push(scrapers.arbeitnow(keywordRaw, location));
        if (activePortals.includes('remoteok')) fetchPromises.push(scrapers.remoteok(keywordRaw, location));
        if (activePortals.includes('weworkremotely')) fetchPromises.push(scrapers.weworkremotely(keywordRaw, location));
        if (activePortals.includes('indeed')) fetchPromises.push(scrapers.indeed(keywordRaw, location));
        if (activePortals.includes('seek')) fetchPromises.push(scrapers.seek(keywordRaw, location));
        if (activePortals.includes('jora')) fetchPromises.push(scrapers.jora(keywordRaw, location));
        
        const results = await Promise.allSettled(fetchPromises);
        let allBaseJobs = [];
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value) {
                allBaseJobs = allBaseJobs.concat(res.value);
            }
        });
        
        const jobsWithDetails = allBaseJobs.map((job) => {
            const description = job.description || '';
            const visaSponsorship = visaRegex.test(description) && !noVisaRegex.test(description);
            const expMatch = description.match(expRegex);
            const experience = expMatch ? expMatch[0] : 'Not mentioned';
            return {
                ...job,
                description: undefined, 
                visaSponsorship: visaSponsorship,
                experience,
                matchScore: null 
            };
        });
        
        res.json({ jobs: jobsWithDetails });
    } catch (error) {
        console.error('Error fetching jobs:', error.message);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

app.post('/api/score', async (req, res) => {
    try {
        const { link } = req.body;
        if (!process.env.GEMINI_API_KEY) return res.json({ score: 'N/A' });
        
        let description = '';
        if (link.includes('linkedin.com')) {
            const match = link.match(/-(\d+)\??/) || link.match(/view\/(\d+)/);
            const jobId = match ? match[1] : null;
            const targetUrl = jobId ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}` : link;
            const linkRes = await axios.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $$ = cheerio.load(linkRes.data);
            description = $$('.show-more-less-html__markup').text().trim() || $$('.description__text').text().trim() || '';
        } else {
             const linkRes = await axios.get(link, { headers: { 'User-Agent': 'Mozilla/5.0' } });
             const $$ = cheerio.load(linkRes.data);
             description = $$('body').text().trim();
        }
        
        const resumeText = await getResumeText();
        if (!resumeText || !description) return res.json({ score: 'N/A' });
        
        const prompt = `Compare this resume to the job description. Output ONLY a single number between 0 and 100 representing the match percentage. Do not include a % sign or any other text.\n\nResume:\n${resumeText}\n\nJob Description:\n${description}`;
        const aiRes = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
        });
        const numMatch = aiRes.text.match(/\d+/);
        res.json({ score: numMatch ? numMatch[0] : 'N/A' });
    } catch (e) {
        res.json({ score: 'Error' });
    }
});

app.post('/api/cover-letter', async (req, res) => {
    try {
        const { link, company, title } = req.body;
        if (!link || !company || !title) return res.status(400).json({ error: 'Missing required fields' });
        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({ error: 'GEMINI_API_KEY is not set on the backend.' });
        }
        
        let description = '';
        if (link.includes('linkedin.com')) {
            const match = link.match(/-(\d+)\??/) || link.match(/view\/(\d+)/);
            const jobId = match ? match[1] : null;
            const targetUrl = jobId ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}` : link;
            const linkRes = await axios.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $$ = cheerio.load(linkRes.data);
            description = $$('.show-more-less-html__markup').text().trim() || $$('.description__text').text().trim() || '';
        } else {
             const linkRes = await axios.get(link, { headers: { 'User-Agent': 'Mozilla/5.0' } });
             const $$ = cheerio.load(linkRes.data);
             description = $$('body').text().trim();
        }
        
        const resumeText = await getResumeText();
        const prompt = `You are an expert career coach writing a cover letter.
Job Title: ${title}
Company: ${company}

Job Description:
${description}

My Resume:
${resumeText}

Task: Write a professional, tailored cover letter for this job based ONLY on my actual resume. DO NOT invent skills or experience I don't have. Keep it concise.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
        });
        
        const coverLetter = response.text;
        const safeCompany = company.replace(/[^a-z0-9]/gi, '_');
        const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
        const folderPath = path.join(__dirname, '..', 'Applications', `${safeCompany}_${safeTitle}`);
        
        fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(path.join(folderPath, 'Job_Description.txt'), description);
        fs.writeFileSync(path.join(folderPath, 'Cover_Letter.txt'), coverLetter);
        
        res.json({ success: true, folderPath });
    } catch (error) {
        console.error('Error generating cover letter:', error.message);
        res.status(500).json({ error: 'Failed to generate cover letter: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
