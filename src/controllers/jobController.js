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
 * Determine Chrome/Chromium executable based on OS or env variable
 */
function getChromeExecutablePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const platform = process.platform;
  if (platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  if (platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "/usr/bin/google-chrome-stable";
}

/**
 * LinkedIn Job Scraper
 * Supports filtering by skills, date range, and experience level
 * @route GET /api/jobs
 */
export const scrapeLinkedInJobs = asyncHandler(async (req, res) => {
  try {
    const {
      jobTitle,
      location,
      limit = 10,
      skills,
      dateRange,
      experience,
    } = req.query;

    if (!jobTitle) {
      res.status(400);
      throw new Error("Job title is required");
    }

    const skillsArray = skills ? skills.split(",").map((s) => s.trim()) : [];
    const jobLimit = Math.max(1, parseInt(limit, 10) || 10);
    const keywords = encodeURIComponent(jobTitle);
    const locParam = location
      ? `&location=${encodeURIComponent(location)}`
      : "";

    // Configure date filter (f_TPR)
    let dateFilter = "f_TPR=r86400";
    if (dateRange) {
      const dr = dateRange.toString().toLowerCase();
      let seconds;
      if (dr === "day" || dr === "1") seconds = 86400;
      else if (dr === "3") seconds = 3 * 86400;
      else if (dr === "week" || dr === "7") seconds = 7 * 86400;
      else if (dr === "month" || dr === "30") seconds = 30 * 86400;
      else if (!isNaN(parseInt(dr, 10))) seconds = parseInt(dr, 10) * 86400;
      else seconds = 86400;
      dateFilter = `f_TPR=r${seconds}`;
    }

    // Configure experience filter (f_E)
    let expParam = "";
    if (experience) {
      const key = experience.toString().toLowerCase().replace(/[-\s]/g, "_");
      const expMap = {
        internship: "1",
        entry_level: "2",
        associate: "3",
        mid_senior_level: "4",
        director: "5",
        executive: "6",
      };
      const code = expMap[key];
      if (code) expParam = `&f_E=${code}`;
      else console.warn(`Unsupported experience level: ${experience}`);
    }

    // Construct URL
    const url = `https://www.linkedin.com/jobs/search?keywords=${keywords}${locParam}&${dateFilter}${expParam}`;
    console.log(`Navigating to: ${url}`);

    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: getChromeExecutablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1920x1080",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.google.com",
    });

    // Navigate and load
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await delay(3000);
    await autoScroll(page, "ul.jobs-search__results-list");

    // Extract job postings including experience level
    const jobs = await page.evaluate((limit) => {
      const items = document.querySelectorAll(
        "ul.jobs-search__results-list li"
      );
      const list = [];
      items.forEach((el) => {
        if (list.length >= limit) return;
        const titleEl = el.querySelector("h3.base-search-card__title");
        const compEl = el.querySelector("h4.base-search-card__subtitle");
        const locEl = el.querySelector("span.job-search-card__location");
        const linkEl = el.querySelector("a.base-card__full-link");
        const dateEl = el.querySelector("time");
        if (!titleEl || !compEl || !linkEl) return;

        // Extract experience/metadata
        const metadataLis = el.querySelectorAll(
          "ul.base-search-card__metadata-list li, ul.job-card-container__metadata-list li"
        );
        // let expLevel = '';
        // metadataLis.forEach(li => {
        //   const txt = li.textContent.trim();
        //   if (/level/i.test(txt) || /year/i.test(txt)) expLevel = txt;
        // });

        const href = linkEl.href;
        const match = href.match(/-(\d+)(?:\?|$)/);
        const jobId = match ? match[1] : href;

        list.push({
          title: titleEl.textContent.trim(),
          company: compEl.textContent.trim(),
          location: locEl ? locEl.textContent.trim() : "Unknown Location",
          link: href,
          datePosted: dateEl ? dateEl.getAttribute("datetime") : "",
          id: jobId,
          // experienceLevel: expLevel,
        });
      });
      return list;
    }, jobLimit);

    await browser.close();

    // Filter by skills if provided
    const filtered = skillsArray.length
      ? jobs.filter((j) =>
          skillsArray.some((s) =>
            j.title.toLowerCase().includes(s.toLowerCase())
          )
        )
      : jobs;

    return res
      .status(200)
      .json({ success: true, status: 200, count: filtered.length, jobs: filtered });
  } catch (error) {
    console.error("Error during scraping:", error);
    return res.status(500).json({ status: 500, message: "Internal Server Error" });
  }
});

/**
 * Scrolls the container to load dynamic content
 */
async function autoScroll(page, selector) {
  await page.evaluate(async (sel) => {
    const container = document.querySelector(sel) || document.documentElement;
    let total = 0;
    const dist = 200;
    while (total < container.scrollHeight) {
      container.scrollBy(0, dist);
      total += dist;
      await new Promise((r) => setTimeout(r, 150));
    }
  }, selector);
}

export default scrapeLinkedInJobs;
