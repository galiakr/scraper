import puppeteer from 'puppeteer';

(async () => {
  try {
    await puppeteer.createBrowserFetcher().download('chrome');
    console.log('Chrome downloaded successfully');
  } catch (error) {
    console.error('Error downloading Chrome:', error);
  }
})();
