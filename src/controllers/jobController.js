import asyncHandler from "../utils/asyncHandler.js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Add stealth plugin to puppeteer (helps avoid detection)
puppeteer.use(StealthPlugin());

/**
 * Simple delay helper
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get Chrome/Chromium executable based on OS or env variable
 */
function getChromeExecutablePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const platform = process.platform;
  if (platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome-stable';
}

/**
 * LinkedIn Job Scraper using Puppeteer with stealth and dynamic selectors
 */
export const scrapeLinkedInJobs = asyncHandler(async (req, res) => {
  const { jobTitle, location, limit = 10, skills } = req.query;
  if (!jobTitle) {
    res.status(400);
    throw new Error("Job title is required");
  }

  const skillsArray = skills ? skills.split(",").map((s) => s.trim()) : [];
  const jobLimit = Math.max(1, parseInt(limit, 10) || 10);
  const keywords = encodeURIComponent(jobTitle);
  const locParam = location ? `&location=${encodeURIComponent(location)}` : '';
  const url = `https://www.linkedin.com/jobs/search?keywords=${keywords}${locParam}&f_TPR=r86400`;
  console.log(`Navigating to: ${url}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: getChromeExecutablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920x1080',
    ],
  });
  const page = await browser.newPage();

  // Standard headers
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116 Safari/537.36'
  );
  await page.setViewport({ width: 1366, height: 768 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com',
  });

  // Load search page
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // Allow content to load
  await delay(3000);

  // Scroll the jobs container to load more
  await autoScroll(page, 'ul.jobs-search__results-list');

  // Extract jobs using updated selectors and correct ID parsing
  const jobs = await page.evaluate((limit) => {
    const listItems = document.querySelectorAll('ul.jobs-search__results-list li');
    const out = [];
    for (let i = 0; i < listItems.length && out.length < limit; i++) {
      const el = listItems[i];
      const titleEl = el.querySelector('h3.base-search-card__title, h3.jobs-search-results__list-item h3');
      const companyEl = el.querySelector('h4.base-search-card__subtitle, h4.jobs-search-results__list-item h4');
      const locEl = el.querySelector('span.job-search-card__location, span.jobs-search-results__list-item__location');
      const linkEl = el.querySelector('a.base-card__full-link, a.jobs-search-results__list-item a');
      const dateEl = el.querySelector('time');

      if (!titleEl || !companyEl || !linkEl) continue; // skip incomplete

      const linkHref = linkEl.href;
      // Extract numeric job ID from URL
      const idMatch = linkHref.match(/-(\d+)(?:\?|$)/);
      const jobId = idMatch ? idMatch[1] : linkHref;

      out.push({
        title: titleEl.textContent.trim(),
        company: companyEl.textContent.trim(),
        location: locEl ? locEl.textContent.trim() : 'Unknown Location',
        link: linkHref,
        datePosted: dateEl ? dateEl.getAttribute('datetime') : '',
        id: jobId,
      });
    }
    return out;
  }, jobLimit);

  await browser.close();

  // Apply skill filtering if provided
  const result = skillsArray.length
    ? jobs.filter((j) =>
        skillsArray.some((skill) => j.title.toLowerCase().includes(skill.toLowerCase()))
      )
    : jobs;

  return res.status(200).json({ success: true, count: result.length, jobs: result });
});

/**
 * Auto-scroll a container until full height
 */
async function autoScroll(page, containerSelector) {
  await page.evaluate(async (sel) => {
    const container = document.querySelector(sel) || document.documentElement;
    let total = 0;
    const distance = 200;
    while (total < container.scrollHeight) {
      container.scrollBy(0, distance);
      total += distance;
      await new Promise((r) => setTimeout(r, 150));
    }
  }, containerSelector);
}



// // Alternative simpler approach using proxy (if you prefer not to use Puppeteer)
// const scrapeWithProxy = asyncHandler(async (req, res) => {
//   // Extract parameters from request query
//   const { jobTitle, location, limit = 10, skills } = req.query;
  
//   // Validate required parameters
//   if (!jobTitle) {
//     res.status(400);
//     throw new Error('Job title is required');
//   }
  
//   try {
//     // Format the search query for LinkedIn
//     const searchQuery = encodeURIComponent(`${jobTitle} ${location || ''}`);
//     const targetUrl = `https://www.linkedin.com/jobs/search/?keywords=${searchQuery}&f_TPR=r86400`;
    
//     // Using a free proxy service
//     const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    
//     const response = await axios.get(proxyUrl, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
//       }
//     });
    
//     // Process the HTML with cheerio
//     const $ = cheerio.load(response.data);
//     const jobs = [];
    
//     // Extract job listings with cheerio
//     $('.job-search-card').each((i, element) => {
//       if (i >= parseInt(limit)) return false;
      
//       const title = $(element).find('.base-search-card__title').text().trim();
//       const company = $(element).find('.base-search-card__subtitle').text().trim();
//       const jobLocation = $(element).find('.job-search-card__location').text().trim();
//       const link = $(element).find('a.base-card__full-link').attr('href');
//       const datePosted = $(element).find('.job-search-card__listdate').attr('datetime') || 'Recent';
      
//       jobs.push({
//         id: `job-${i}`,
//         title,
//         company,
//         location: jobLocation,
//         link,
//         datePosted
//       });
//     });
    
//     // Filter by skills if needed
//     const skillsArray = skills ? skills.split(',').map(s => s.trim()) : [];
//     const filteredJobs = skillsArray.length > 0
//       ? jobs.filter(job => skillsArray.some(skill => job.title.toLowerCase().includes(skill.toLowerCase())))
//       : jobs;
    
//     return res.status(200).json({
//       success: true,
//       count: filteredJobs.length,
//       jobs: filteredJobs
//     });
    
//   } catch (error) {
//     console.error('Error scraping LinkedIn jobs with proxy:', error.message);
//     res.status(500);
//     throw new Error('Failed to scrape LinkedIn jobs with proxy: ' + error.message);
//   }
// });

export default scrapeLinkedInJobs;