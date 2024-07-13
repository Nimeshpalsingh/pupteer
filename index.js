const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const randomUseragent = require('random-useragent');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

async function getImageUrls(query, start = 0, count = 30) {
    const browser = await puppeteer.launch({
        headless: false, // Set to true for production, false for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();

    // Set a random user agent
    const userAgent = randomUseragent.getRandom();
    await page.setUserAgent(userAgent);

    query = query.replace(' ', '+');
    const searchUrl = `https://yandex.com/images/search?text=${query}&from=${start}&num=${count}`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    let imageUrls = [];
    let seenUrls = new Set(); // To keep track of seen URLs

    function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    try {
        if (page.url().includes('showcaptcha')) {
            throw new Error('CAPTCHA detected');
        }

        await page.waitForSelector('.SerpItem', { timeout: 10000 });
        let lastHeight = await page.evaluate('document.body.scrollHeight');

        while (imageUrls.length < count) {
            let newImageUrls = await page.evaluate(() => {
                let items = Array.from(document.querySelectorAll('.SerpItem'));
                return items.map(item => {
                    let thumbnail = item.querySelector('img').src;
                    let link = item.querySelector('a').href;
                    let original = new URL(link).searchParams.get('img_url');
                    return {
                        thumbnail_url: thumbnail,
                        original_url: original || "N/A"
                    };
                });
            });

            // Filter out already seen URLs
            newImageUrls = newImageUrls.filter(img => !seenUrls.has(img.original_url));
            // Add new URLs to the seen set
            newImageUrls.forEach(img => seenUrls.add(img.original_url));

            imageUrls = [...imageUrls, ...newImageUrls];

            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await timeout(1000 + Math.random() * 2000); // Random delay between 1-3 seconds

            let newHeight = await page.evaluate('document.body.scrollHeight');
            if (newHeight === lastHeight) break;
            lastHeight = newHeight;
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
        if (e.message.includes('CAPTCHA')) {
            await browser.close();
            return { error: 'CAPTCHA detected' };
        } else {
            await page.screenshot({ path: 'error_screenshot.png' });
            const htmlContent = await page.content();
            const fs = require('fs');
            fs.writeFileSync('error_page.html', htmlContent);
        }
    }

    await browser.close();
    return imageUrls.slice(0, count);
}

app.post('/api_img_search', async (req, res) => {
    const { query, start, count } = req.body;
    if (!query) {
        return res.status(400).json({ error: "Query parameter 'query' is required." });
    }

    const startIdx = start || 0;
    const imageCount = count || 30;

    let retries = 3;
    let imageData;
    for (let attempt = 1; attempt <= retries; attempt++) {
        imageData = await getImageUrls(query, startIdx, imageCount);
        if (imageData.error) {
            console.log(`CAPTCHA detected. Retrying... (${attempt}/${retries})`);
            if (attempt === retries) {
                return res.status(429).json({ error: "Too many CAPTCHA challenges. Please try again later." });
            }
        } else {
            break;
        }
    }

    if (imageData.length) {
        res.json({ images: imageData });
    } else {
        res.json({ message: "No images found for the query." });
    }
});

const server = app.listen(5000, () => {
    console.log('Server is running on port 5000');
});

function gracefulShutdown() {
    console.log("Received kill signal, shutting down gracefully.");
    server.close(() => {
        console.log("Closed out remaining connections.");
        process.exit(0);
    });

    setTimeout(() => {
        console.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
    }, 10 * 1000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);















// const express = require('express');
// const cors = require('cors');
// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// const randomUseragent = require('random-useragent');

// puppeteer.use(StealthPlugin());

// const app = express();
// app.use(cors());
// app.use(express.json());

// async function getImageUrls(query, start = 0, count = 30) {
//     const browser = await puppeteer.launch({
//         headless: false, // Set to true for production, false for debugging
//         args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
//     });
//     const page = await browser.newPage();

//     // Set a random user agent
//     const userAgent = randomUseragent.getRandom();
//     await page.setUserAgent(userAgent);

//     query = query.replace(' ', '+');
//     const searchUrl = `https://yandex.com/images/search?text=${query}&from=${start}&num=${count}`;

//     await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

//     let imageUrls = [];
//     let seenUrls = new Set(); // To keep track of seen URLs

//     function timeout(ms) {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     try {
//         await page.waitForSelector('.SerpItem', { timeout: 10000 });
//         let lastHeight = await page.evaluate('document.body.scrollHeight');

//         while (imageUrls.length < count) {
//             let newImageUrls = await page.evaluate(() => {
//                 let items = Array.from(document.querySelectorAll('.SerpItem'));
//                 return items.map(item => {
//                     let thumbnail = item.querySelector('img').src;
//                     let link = item.querySelector('a').href;
//                     let original = new URL(link).searchParams.get('img_url');
//                     return {
//                         thumbnail_url: thumbnail,
//                         original_url: original || "N/A"
//                     };
//                 });
//             });

//             // Filter out already seen URLs
//             newImageUrls = newImageUrls.filter(img => !seenUrls.has(img.original_url));
//             // Add new URLs to the seen set
//             newImageUrls.forEach(img => seenUrls.add(img.original_url));

//             imageUrls = [...imageUrls, ...newImageUrls];

//             await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
//             await timeout(1000 + Math.random() * 2000); // Random delay between 1-3 seconds

//             let newHeight = await page.evaluate('document.body.scrollHeight');
//             if (newHeight === lastHeight) break;
//             lastHeight = newHeight;
//         }
//     } catch (e) {
//         console.log(`Error: ${e.message}`);
//         await page.screenshot({ path: 'error_screenshot.png' });
//         const htmlContent = await page.content();
//         const fs = require('fs');
//         fs.writeFileSync('error_page.html', htmlContent);
//     }

//     await browser.close();
//     return imageUrls.slice(0, count);
// }

// app.post('/api_img_search', async (req, res) => {
//     const { query, start, count } = req.body;
//     if (!query) {
//         return res.status(400).json({ error: "Query parameter 'query' is required." });
//     }

//     const startIdx = start || 0;
//     const imageCount = count || 30;
//     const imageData = await getImageUrls(query, startIdx, imageCount);

//     if (imageData.length) {
//         res.json({ images: imageData });
//     } else {
//         res.json({ message: "No images found for the query." });
//     }
// });

// const server = app.listen(5000, () => {
//     console.log('Server is running on port 5000');
// });

// function gracefulShutdown() {
//     console.log("Received kill signal, shutting down gracefully.");
//     server.close(() => {
//         console.log("Closed out remaining connections.");
//         process.exit(0);
//     });

//     setTimeout(() => {
//         console.error("Could not close connections in time, forcefully shutting down");
//         process.exit(1);
//     }, 10 * 1000);
// }

// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);






















// const express = require('express');
// const cors = require('cors');
// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// const randomUseragent = require('random-useragent');

// puppeteer.use(StealthPlugin());

// const app = express();
// app.use(cors());
// app.use(express.json());

// async function getImageUrls(query, start = 0, count = 10) {
//     const browser = await puppeteer.launch({
//         headless: false, // Set to true for production, false for debugging
//         args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
//     });
//     const page = await browser.newPage();

//     // Set a random user agent
//     const userAgent = randomUseragent.getRandom();
//     await page.setUserAgent(userAgent);

//     query = query.replace(' ', '+');
//     const searchUrl = `https://yandex.com/images/search?text=${query}&from=${start}&num=${count}`;

//     await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

//     let imageUrls = [];

//     function timeout(ms) {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     try {
//         await page.waitForSelector('.SerpItem', { timeout: 10000 });
//         let lastHeight = await page.evaluate('document.body.scrollHeight');

//         while (imageUrls.length < count) {
//             let newImageUrls = await page.evaluate(() => {
//                 let items = Array.from(document.querySelectorAll('.SerpItem'));
//                 return items.map(item => {
//                     let thumbnail = item.querySelector('img').src;
//                     let link = item.querySelector('a').href;
//                     let original = new URL(link).searchParams.get('img_url');
//                     return {
//                         thumbnail_url: thumbnail,
//                         original_url: original || "N/A"
//                     };
//                 });
//             });

//             imageUrls = [...imageUrls, ...newImageUrls];
//             imageUrls = [...new Map(imageUrls.map(item => [item['original_url'], item])).values()];

//             await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
//             await timeout(1000 + Math.random() * 2000); // Random delay between 1-3 seconds

//             let newHeight = await page.evaluate('document.body.scrollHeight');
//             if (newHeight === lastHeight) break;
//             lastHeight = newHeight;
//         }
//     } catch (e) {
//         console.log(`Error: ${e.message}`);
//         await page.screenshot({ path: 'error_screenshot.png' });
//         const htmlContent = await page.content();
//         const fs = require('fs');
//         fs.writeFileSync('error_page.html', htmlContent);
//     }

//     await browser.close();
//     return imageUrls.slice(0, count);
// }

// app.post('/api_img_search', async (req, res) => {
//     const { query, start, count } = req.body;
//     if (!query) {
//         return res.status(400).json({ error: "Query parameter 'query' is required." });
//     }

//     const startIdx = start || 0;
//     const imageCount = count || 10;
//     const imageData = await getImageUrls(query, startIdx, imageCount);

//     if (imageData.length) {
//         res.json({ images: imageData });
//     } else {
//         res.json({ message: "No images found for the query." });
//     }
// });

// const server = app.listen(5000, () => {
//     console.log('Server is running on port 5000');
// });

// function gracefulShutdown() {
//     console.log("Received kill signal, shutting down gracefully.");
//     server.close(() => {
//         console.log("Closed out remaining connections.");
//         process.exit(0);
//     });

//     setTimeout(() => {
//         console.error("Could not close connections in time, forcefully shutting down");
//         process.exit(1);
//     }, 10 * 1000);
// }

// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);


















// const express = require('express');
// const cors = require('cors');
// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// puppeteer.use(StealthPlugin());

// const app = express();
// app.use(cors());
// app.use(express.json());

// async function getImageUrls(query, start = 0, count = 10) {
//     const browser = await puppeteer.launch({
//         headless: true,
//         args: ['--no-sandbox', '--disable-setuid-sandbox']
//     });
//     const page = await browser.newPage();

//     query = query.replace(' ', '+');
//     const searchUrl = `https://yandex.com/images/search?text=${query}&from=${start}&num=${count}`;

//     await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

//     let imageUrls = [];

//     function timeout(ms) {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     try {
//         await page.waitForSelector('.SerpItem', { timeout: 10000 }); // Increased timeout to 10000ms (10 seconds)
//         let lastHeight = await page.evaluate('document.body.scrollHeight');

//         while (imageUrls.length < count) {
//             let newImageUrls = await page.evaluate(() => {
//                 let items = Array.from(document.querySelectorAll('.SerpItem'));
//                 return items.map(item => {
//                     let thumbnail = item.querySelector('img').src;
//                     let link = item.querySelector('a').href;
//                     let original = new URL(link).searchParams.get('img_url');
//                     return {
//                         thumbnail_url: thumbnail,
//                         original_url: original || "N/A"
//                     };
//                 });
//             });

//             imageUrls = [...imageUrls, ...newImageUrls];
//             imageUrls = [...new Map(imageUrls.map(item => [item['original_url'], item])).values()]; // Remove duplicates

//             await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
//             await timeout(1000); // Custom timeout function

//             let newHeight = await page.evaluate('document.body.scrollHeight');
//             if (newHeight === lastHeight) break;
//             lastHeight = newHeight;
//         }
//     } catch (e) {
//         console.log(`Error: ${e.message}`);
//         // Screenshot and HTML for debugging
//         await page.screenshot({ path: 'error_screenshot.png' });
//         const htmlContent = await page.content();
//         const fs = require('fs');
//         fs.writeFileSync('error_page.html', htmlContent);
//     }

//     await browser.close();
//     return imageUrls.slice(0, count);
// }

// app.post('/api_img_search', async (req, res) => {
//     const { query, start, count } = req.body;
//     if (!query) {
//         return res.status(400).json({ error: "Query parameter 'query' is required." });
//     }

//     const startIdx = start || 0;
//     const imageCount = count || 10;
//     const imageData = await getImageUrls(query, startIdx, imageCount);

//     if (imageData.length) {
//         res.json({ images: imageData });
//     } else {
//         res.json({ message: "No images found for the query." });
//     }
// });

// const server = app.listen(5000, () => {
//     console.log('Server is running on port 5000');
// });

// function gracefulShutdown() {
//     console.log("Received kill signal, shutting down gracefully.");
//     server.close(() => {
//         console.log("Closed out remaining connections.");
//         process.exit(0);
//     });

//     // if after 10 seconds, force shutdown
//     setTimeout(() => {
//         console.error("Could not close connections in time, forcefully shutting down");
//         process.exit(1);
//     }, 10 * 1000);
// }

// // Listen for termination signals
// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);









// const express = require('express');
// const cors = require('cors');
// const puppeteer = require('puppeteer');

// const app = express();
// app.use(cors());
// app.use(express.json());

// async function getImageUrls(query, start = 0, count = 10) {
//     const browser = await puppeteer.launch({
//         headless: true,
//         args: ['--no-sandbox', '--disable-setuid-sandbox']
//     });
//     const page = await browser.newPage();

//     query = query.replace(' ', '+');
//     const searchUrl = `https://yandex.com/images/search?text=${query}&from=${start}&num=${count}`;

//     await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

//     let imageUrls = [];

//     function timeout(ms) {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     try {
//         await page.waitForSelector('.SerpItem', { timeout: 10000 }); // Increased timeout to 10000ms (10 seconds)
//         let lastHeight = await page.evaluate('document.body.scrollHeight');

//         while (imageUrls.length < count) {
//             let newImageUrls = await page.evaluate(() => {
//                 let items = Array.from(document.querySelectorAll('.SerpItem'));
//                 return items.map(item => {
//                     let thumbnail = item.querySelector('img').src;
//                     let link = item.querySelector('a').href;
//                     let original = new URL(link).searchParams.get('img_url');
//                     return {
//                         thumbnail_url: thumbnail,
//                         original_url: original || "N/A"
//                     };
//                 });
//             });

//             imageUrls = [...imageUrls, ...newImageUrls];
//             imageUrls = [...new Map(imageUrls.map(item => [item['original_url'], item])).values()]; // Remove duplicates

//             await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
//             await timeout(1000); // Custom timeout function

//             let newHeight = await page.evaluate('document.body.scrollHeight');
//             if (newHeight === lastHeight) break;
//             lastHeight = newHeight;
//         }
//     } catch (e) {
//         console.log(`Error: ${e.message}`);
//         // Screenshot and HTML for debugging
//         await page.screenshot({ path: 'error_screenshot.png' });
//         const htmlContent = await page.content();
//         const fs = require('fs');
//         fs.writeFileSync('error_page.html', htmlContent);
//     }

//     await browser.close();
//     return imageUrls.slice(0, count);
// }

// app.post('/api_img_search', async (req, res) => {
//     const { query, start, count } = req.body;
//     if (!query) {
//         return res.status(400).json({ error: "Query parameter 'query' is required." });
//     }

//     const startIdx = start || 0;
//     const imageCount = count || 10;
//     const imageData = await getImageUrls(query, startIdx, imageCount);

//     if (imageData.length) {
//         res.json({ images: imageData });
//     } else {
//         res.json({ message: "No images found for the query." });
//     }
// });

// const server = app.listen(5000, () => {
//     console.log('Server is running on port 5000');
// });

// function gracefulShutdown() {
//     console.log("Received kill signal, shutting down gracefully.");
//     server.close(() => {
//         console.log("Closed out remaining connections.");
//         process.exit(0);
//     });

//     // if after 10 seconds, force shutdown
//     setTimeout(() => {
//         console.error("Could not close connections in time, forcefully shutting down");
//         process.exit(1);
//     }, 10 * 1000);
// }

// // Listen for termination signals
// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);





// const express = require('express');
// const cors = require('cors');
// const puppeteer = require('puppeteer');

// const app = express();
// app.use(cors());
// app.use(express.json());

// async function getImageUrls(query, start = 0, count = 10) {
//     const browser = await puppeteer.launch({
//         headless: true,
//         args: ['--no-sandbox', '--disable-setuid-sandbox']
//     });
//     const page = await browser.newPage();

//     query = query.replace(' ', '+');
//     const searchUrl = `https://yandex.com/images/search?text=${query}&from=${start}&num=${count}`;

//     await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

//     let imageUrls = [];

//     function timeout(ms) {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     try {
//         await page.waitForSelector('.SerpItem', { timeout: 500 });
//         let lastHeight = await page.evaluate('document.body.scrollHeight');

//         while (imageUrls.length < count) {
//             let newImageUrls = await page.evaluate(() => {
//                 let items = Array.from(document.querySelectorAll('.SerpItem'));
//                 return items.map(item => {
//                     let thumbnail = item.querySelector('img').src;
//                     let link = item.querySelector('a').href;
//                     let original = new URL(link).searchParams.get('img_url');
//                     return {
//                         thumbnail_url: thumbnail,
//                         original_url: original || "N/A"
//                     };
//                 });
//             });

//             imageUrls = [...imageUrls, ...newImageUrls];
//             imageUrls = [...new Map(imageUrls.map(item => [item['original_url'], item])).values()]; // Remove duplicates

//             await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
//             await timeout(1000); // Custom timeout function

//             let newHeight = await page.evaluate('document.body.scrollHeight');
//             if (newHeight === lastHeight) break;
//             lastHeight = newHeight;
//         }
//     } catch (e) {
//         console.log(`Error: ${e.message}`);
//     }

//     await browser.close();
//     return imageUrls.slice(0, count);
// }

// app.post('/api_img_search', async (req, res) => {
//     const { query, start, count } = req.body;
//     if (!query) {
//         return res.status(400).json({ error: "Query parameter 'query' is required." });
//     }

//     const startIdx = start || 0;
//     const imageCount = count || 10;
//     const imageData = await getImageUrls(query, startIdx, imageCount);

//     if (imageData.length) {
//         res.json({ images: imageData });
//     } else {
//         res.json({ message: "No images found for the query." });
//     }
// });

// const server = app.listen(5000, () => {
//     console.log('Server is running on port 5000');
// });

// function gracefulShutdown() {
//     console.log("Received kill signal, shutting down gracefully.");
//     server.close(() => {
//         console.log("Closed out remaining connections.");
//         process.exit(0);
//     });

//     // if after 10 seconds, force shutdown
//     setTimeout(() => {
//         console.error("Could not close connections in time, forcefully shutting down");
//         process.exit(1);
//     }, 10 * 1000);
// }

// // Listen for termination signals
// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);





















// const express = require('express');
// const cors = require('cors');
// const puppeteer = require('puppeteer');
// const { URL } = require('url');

// const app = express();
// app.use(cors());
// app.use(express.json());

// async function getImageUrls(query, startIndex = 0, chunkSize = 10) {
//     const browser = await puppeteer.launch({
//         headless: true,
//         args: ['--no-sandbox', '--disable-setuid-sandbox']
//     });
//     const page = await browser.newPage();

//     query = query.replace(' ', '+');
//     const searchUrl = `https://yandex.com/images/search?text=${query}`;

//     await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

//     let imageUrls = [];

//     function timeout(ms) {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     try {
//         await page.waitForSelector('.SerpItem', { timeout: 5000 }); // Increased timeout to 5000ms (5 seconds)
//         let lastHeight = await page.evaluate('document.body.scrollHeight');

//         while (imageUrls.length < startIndex + chunkSize) {
//             let newImageUrls = await page.evaluate(() => {
//                 let items = Array.from(document.querySelectorAll('.SerpItem'));
//                 return items.map(item => {
//                     let thumbnail = item.querySelector('img').src;
//                     let link = item.querySelector('a').href;
//                     let original = new URL(link).searchParams.get('img_url');
//                     return {
//                         thumbnail_url: thumbnail,
//                         original_url: original || "N/A"
//                     };
//                 });
//             });

//             imageUrls = [...imageUrls, ...newImageUrls];
//             imageUrls = [...new Map(imageUrls.map(item => [item['original_url'], item])).values()]; // Remove duplicates

//             await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
//             await timeout(3000); // Custom timeout function

//             let newHeight = await page.evaluate('document.body.scrollHeight');
//             if (newHeight === lastHeight) break;
//             lastHeight = newHeight;
//         }
//     } catch (e) {
//         console.log(`Error: ${e.message}`);
//     }

//     await browser.close();
//     return imageUrls.slice(startIndex, startIndex + chunkSize);
// }

// app.post('/api_img_search', async (req, res) => {
//     const { query, start_index, chunk_size } = req.body;
//     if (!query) {
//         return res.status(400).json({ error: "Query parameter 'query' is required." });
//     }

//     const startIndex = start_index || 0;
//     const chunkSize = chunk_size || 10;
//     const imageData = await getImageUrls(query, startIndex, chunkSize);

//     if (imageData.length) {
//         res.json({ images: imageData });
//     } else {
//         res.json({ message: "No images found for the query." });
//     }
// });

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//     console.log(`Server is running on port ${PORT}`);
// });
