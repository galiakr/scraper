import puppeteer from 'puppeteer';
import mongoose from 'mongoose';
import * as cheerio from 'cheerio';

// Define Mongoose Schema and Model
const ScrapedDataSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true, unique: true },
  startDate: { type: Date },
  endDate: { type: Date },
  city: String,
  country: String,
  cfpUrl: { type: String, unique: true },
  cfpEndDate: Date,
  twitter: String,
  mastodon: String,
  topics: [String],
  codeOfConduct: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Create indexes for faster duplicate checking
ScrapedDataSchema.index({ url: 1, cfpUrl: 1 });

// Pre-save middleware to update the updatedAt timestamp
ScrapedDataSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Helper function to clean URLs (remove query parameters and trailing slashes)
const cleanUrl = (url) => {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`.replace(
      /\/$/,
      ''
    );
  } catch (e) {
    return url;
  }
};

// Function to handle database connection
const connectDB = async () => {
  if (!mongoose.connection.readyState) {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
};

// Function to save scraped data with duplicate checking
const saveScrapedData = async (parsedData) => {
  const results = {
    saved: 0,
    duplicates: 0,
    errors: [],
  };

  for (const item of parsedData) {
    try {
      // Clean URLs before checking for duplicates
      const cleanedUrl = cleanUrl(item.url);
      const cleanedCfpUrl = cleanUrl(item.cfpUrl);

      // Prepare the document
      const doc = {
        ...item,
        url: cleanedUrl,
        cfpUrl: cleanedCfpUrl,
        startDate: item.startDate !== 'N/A' ? new Date(item.startDate) : null,
        endDate: item.endDate !== 'N/A' ? new Date(item.endDate) : null,
      };

      // Check for duplicates using URL or CFP URL
      const existingDoc = await ScrapedData.findOne({
        $or: [{ url: cleanedUrl }, { cfpUrl: cleanedCfpUrl }],
      });

      if (existingDoc) {
        // Update existing document with new information
        await ScrapedData.findByIdAndUpdate(existingDoc._id, {
          $set: {
            ...doc,
            updatedAt: new Date(),
          },
        });
        results.duplicates++;
      } else {
        // Create new document
        await ScrapedData.create(doc);
        results.saved++;
      }
    } catch (error) {
      results.errors.push({
        item: item.name || 'Unknown',
        error: error.message,
      });
    }
  }

  return results;
};

const ScrapedData =
  mongoose.models.ScrapedData ||
  mongoose.model('ScrapedData', ScrapedDataSchema);

// Helper function to parse Confs.tech data
const parseConfsTechHTML = (htmlArray) => {
  const parsedResults = [];

  htmlArray.forEach((html) => {
    const $ = cheerio.load(html); // Use cheerio to parse individual HTML snippets

    const name = $('dt.visuallyHidden')
      .filter((_, el) => $(el).text().includes('Conference name'))
      .next()
      .find('a')
      .text();

    const url = $('dt.visuallyHidden')
      .filter((_, el) => $(el).text().includes('Conference name'))
      .next()
      .find('a')
      .attr('href');

    const locationAndDate = $('dt.visuallyHidden')
      .filter((_, el) => $(el).text().includes('Location and date'))
      .next()
      .text()
      .trim();

    const [city, country] = locationAndDate.includes('・')
      ? locationAndDate
          .split('・')[0]
          .split(',')
          .map((s) => s.trim())
      : ['N/A', 'N/A'];

    const dateMatch = locationAndDate.match(
      /([a-zA-Z]+\s\d{1,2})(?:\s-\s([a-zA-Z]+\s\d{1,2}))?/
    );
    const startDate = dateMatch ? dateMatch[1] : 'N/A';
    const endDate = dateMatch && dateMatch[2] ? dateMatch[2] : startDate;

    const cfpUrl = $('dt.visuallyHidden')
      .filter((_, el) => $(el).text().includes('Call for paper end date'))
      .next()
      .find('a')
      .attr('href');

    const twitter = $('dt.visuallyHidden')
      .filter((_, el) => $(el).text().includes('Twitter username'))
      .next()
      .find('a')
      .attr('href');

    const mastodon =
      $('dt.visuallyHidden')
        .filter((_, el) => $(el).text().includes('Mastodon username'))
        .next()
        .find('a')
        .attr('href') || 'N/A';

    const topics = $('ul.ConferenceItem_topics__87OPm li')
      .map((_, el) => $(el).text().trim())
      .get();

    const codeOfConduct =
      $('dt.visuallyHidden')
        .filter((_, el) => $(el).text().includes('Link to code of conduct'))
        .next()
        .find('a')
        .attr('href') || 'N/A';

    const parsedItem = {
      name: name || 'N/A',
      url: url || 'N/A',
      startDate: startDate || 'N/A',
      endDate: endDate || 'N/A',
      city: city || 'N/A',
      country: country || 'N/A',
      cfpUrl: cfpUrl || 'N/A',
      twitter: twitter || 'N/A',
      mastodon: mastodon || 'N/A',
      topics: topics || [],
      codeOfConduct: codeOfConduct || 'N/A',
    };

    parsedResults.push(parsedItem);
  });

  return parsedResults;
};

export default async function handler(req, res) {
  console.log('API Route Hit!');
  console.log('Request Method:', req.method);
  console.log('Request Query:', req.query);
  console.log('Environment:', {
    MONGO_URI: process.env.MONGO_URI ? 'Set' : 'Not Set',
    NODE_ENV: process.env.NODE_ENV,
  });

  const { url, className } = req.query;

  if (!url || !className) {
    return res.status(400).json({ error: 'URL and className are required' });
  }

  try {
    // Connect to MongoDB
    await connectDB(); // Use the new connectDB function
    console.log('MongoDB Connection State:', mongoose.connection.readyState);

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      headless: true,
    });
    const page = await browser.newPage();

    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Scrape elements by className
    const elements = await page.$$eval(`.${className}`, (els) =>
      els.map((el) => el.innerHTML)
    );

    // Parse the scraped HTML for Confs.tech
    const parsedData = parseConfsTechHTML(elements);

    // Close Puppeteer
    await browser.close();

    // Save the scraped data with duplicate checking
    console.log('Attempting to save data:', parsedData.length, 'items');
    const results = await saveScrapedData(parsedData);
    console.log(`Saved: ${results.saved}, Duplicates: ${results.duplicates}`);
    if (results.errors.length > 0) {
      console.log('Errors:', results.errors);
    }

    res.status(200).json({
      success: true,
      results,
      parsedData,
    });
  } catch (error) {
    console.error('Error scraping:', error);
    res.status(500).json({ error: error.message });
  }
}

export { ScrapedData, saveScrapedData, connectDB };
