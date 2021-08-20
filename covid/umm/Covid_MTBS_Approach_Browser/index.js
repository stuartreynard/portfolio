process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
/* nodejs request library */
const qs = require('qs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
//const Discord = require('discord.js');
const proxyChain = require('proxy-chain');

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';

function circularBufferGet(list){

    let obj = list.shift();
    list.push(obj);
    return obj;
}

async function checkAvailability(config){
    console.log('checkAvailability start');
    console.log('checkAvailability end');

    /* Get handles to acitve page, browser, and proxy */
    let page = config.page;
    let browser = config.browser;
    let currProxy = config.currProxy

    /* Close active page, browser, and proxy instances */
    await page.close()
    .catch((e) => {
        console.log('Error while closing page');
    });
    await browser.close()
    .catch((e) => {
        console.log('Error while closing browser');
    });
    await proxyChain.closeAnonymizedProxy(currProxy, true)
    .catch((e) => {
        console.log('unhandledRejection', e);
    });

    /* Get a new page with a fresh proxy */
    await getPageHandle(config)
    .catch((e) => {
        console.log('Error while getting new page');
    });

    page = config.page;

    await page.goto(config.url)
    .catch((e) => {
        console.log('Error on reload');
    });

    let html = await page.content()
    .catch((e) => {
        console.log('Error while waiting for HTML content');
    });

    let $ = cheerio.load(html);

    /*
     * Parse HTML
     */
    let tag = $('div[id=\'D6F73C26-7627-4948-95EA-2C630C25C5E9_scheduleOpenings_OpeningsNoData\']');
    if(0 == tag.length)
    {
        config.available = true;
    }
    else
    {
        config.available = false;
    }
    console.log(`Availabile: ${config.available}`);
    console.log('checkAvailability end');
}

// This is where we'll put the code to get around the tests.
const preparePage = async (page) => {
    // Pass the User-Agent Test.
    const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
    await page.setUserAgent(userAgent);

    // Pass the Webdriver Test.
    await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
    });

    // Pass the Chrome Test.
    await page.evaluateOnNewDocument(() => {
    // We can mock this in as much depth as we need for the test.
    window.chrome = {
      runtime: {
        PlatformOs: {
          MAC: 'mac',
          WIN: 'win',
          ANDROID: 'android',
          CROS: 'cros',
          LINUX: 'linux',
          OPENBSD: 'openbsd',
        },
        PlatformArch: {
          ARM: 'arm',
          X86_32: 'x86-32',
          X86_64: 'x86-64',
        },
        PlatformNaclArch: {
          ARM: 'arm',
          X86_32: 'x86-32',
          X86_64: 'x86-64',
        },
        RequestUpdateCheckStatus: {
          THROTTLED: 'throttled',
          NO_UPDATE: 'no_update',
          UPDATE_AVAILABLE: 'update_available',
        },
        OnInstalledReason: {
          INSTALL: 'install',
          UPDATE: 'update',
          CHROME_UPDATE: 'chrome_update',
          SHARED_MODULE_UPDATE: 'shared_module_update',
        },
        OnRestartRequiredReason: {
          APP_UPDATE: 'app_update',
          OS_UPDATE: 'os_update',
          PERIODIC: 'periodic',
        },
      },
    };
    });

    // Pass the Permissions Test.
    await page.evaluateOnNewDocument(() => {
    const originalQuery = window.navigator.permissions.query;
    return window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    });

    // Pass the Plugins Length Test.
    await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'plugins', {
      // This just needs to have `length > 0` for the current test,
      // but we could mock the plugins too if necessary.
      get: () => [1, 2, 3, 4, 5],
    });
    });

    // Pass the Languages Test.
    await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    });
}

async function getPageHandle(config){

    /* Rotate IP */
    let proxy = circularBufferGet(config.proxies).split(':');

    const ip = proxy.shift();
    const port = proxy.shift();
    const user = proxy.shift();
    const pass = proxy.shift();
    
    /* Reformat to user:pass@ip:port */
    config.currProxy = await proxyChain.anonymizeProxy('http://' + user + ':' + pass + '@' + ip + ':' + port);
    config.currProxy = 'http://127.0.0.1:8080';
    console.log(config.currProxy);

    /* Spin up a new puppeteer browser */
    const browser = await puppeteer.launch({
        args: ['--no-sandbox','--window-size=1280,1024','--disable-infobars', `--proxy-server=${config.currProxy}`],
        ignoreHTTPSErrors: true,
        headless: false
    });

    const page = await browser.newPage();
    
    await page.setViewport({
        width: 1024,
        height: 1280
    });

    /* Set up browser for possible anti-automation checks */
    await preparePage(page);

    /* 60-second timeout */
    await page.setDefaultNavigationTimeout(60000);
    
    /* Maintain handles to page and browser instances. */
    config.browser = browser;
    config.page = page;
}

async function init(config){
    console.log('init start');
    await getPageHandle(config);
    console.log('init end');
}

async function main(){

    const config = require('./config.json');
    config.url = 'https://signupandschedule.umm.edu/mychart/SignUpAndSchedule/EmbeddedSchedule?id=RES^84002860&VT=22759';
    config.proxies = require('./proxies.json');

    /* Set up to catch unhandledRejection */
    process.on('unhandledRejection', error => {
        console.log('unhandledRejection', error.message);
    });
   
    await init(config) 

    let timeout = 0;
    config.available = false;
    while(!config.available){
        /* Check availability on random interval */
        timeout = Math.round(Math.random()*(10000-7500))+7500;
        console.log('Sleeping for ' + timeout.toString() + ' millseconds');
        await new Promise(r => setTimeout(r, timeout));
        await checkAvailability(config)
        .catch((e) => {
            console.log('Error checking availability');
        });
        //config.available = true;
    }
    //clearInterval(timerId);
    process.exit(0);

}

if (require.main === module){
    main()
    .catch((e) => {
        console.log('Error in main execution thread', e);
    });
}

