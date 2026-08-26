const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeBioBio() {
	let browser;
	try {
		const url = 'https://www.biobiochile.cl/bbcl-en-5-minutos/';

		browser = await chromium.launch({ headless: true });
		const context = await browser.newContext({
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			viewport: { width: 1280, height: 720 }
		});

		const page = await context.newPage();

		// Blocks heavy resources for faster info processing
		await page.route('**/*', (route) => {
			const type = route.request().resourceType();
			if (['image', 'media', 'font'].includes(type)) {
				route.abort();
			} else {
				route.continue();
			}
		});

		await page.goto(url, { waitUntil: 'load', timeout: 45000 });

		await page.waitForSelector('.bbcl5-slide-content', { state: 'attached', timeout: 15000 });

		const rawArticles = await page.evaluate(() => {
			const slides = document.querySelectorAll('.bbcl5-slide-content');
			const results = [];

			slides.forEach((slide) => {
				const h2 = slide.querySelector('h2');
				if (!h2) return;

				const title = h2.textContent.trim();

				const bulletItems = Array.from(slide.querySelectorAll('li')).map(li => li.textContent.trim());

				let contrapunto = "";
				const divs = slide.querySelectorAll('div');
				divs.forEach(d => {
					const txt = d.textContent.trim();
					if (txt.startsWith('Sí, pero...') && !contrapunto) {
						contrapunto = txt;
					}
				});

				const linkEl = slide.querySelector('a[href*="/noticias/"]');
				const articleUrl = linkEl ? linkEl.href : window.location.href;

				const fullBody = [...bulletItems, contrapunto].filter(Boolean).join(' ');

				if (title && fullBody) {
					results.push({
						title,
						body: fullBody,
						url: articleUrl
					});
				}
			});

			return results;
		});

		const alexaFeed = [];

		rawArticles.forEach((article) => {
			const paragraphs = article.body.split('. ');
			const uniqueParagraphs = [...new Set(paragraphs)];
			let cleanBody = uniqueParagraphs.join('. ').replace(/\s+/g, ' ').trim();

			if (cleanBody.length > 4300) {
				cleanBody = cleanBody.substring(0, 4300) + '...';
			}

			cleanBody = cleanBody.replace(/\?/g, '? <break time="400ms"/>');
			cleanBody = cleanBody.replace(/US\$\s?([0-9.,\s]+)/gi, '$1 de dólares');

			const titleSlug = article.title
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.replace(/[^a-z0-9\s-]/g, "")
				.trim()
				.replace(/\s+/g, "-");

			const feedUID = `bbcl-${titleSlug}`;

			if (!alexaFeed.some(feed => feed.uid === feedUID)) {
				alexaFeed.push({
					"uid": feedUID,
					"updateDate": new Date().toISOString(),
					"titleText": article.title,
					"mainText": `<emphasis level="strong">${article.title}</emphasis>. <break time="800ms"/> ${cleanBody}`,
					"redirectionUrl": article.url || url
				});
			}
		});

		fs.writeFileSync('feed.json', JSON.stringify(alexaFeed, null, 2));
	} catch (error) {
		console.error('Scraping error:', error.message);
		process.exit(1);
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}

scrapeBioBio();