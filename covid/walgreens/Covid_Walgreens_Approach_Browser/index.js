process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
/* nodejs request library */
const axios = require('axios').default;
axios.defaults.withCredentials=true;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const qs = require('qs');
const httpsProxyAgent = require('https-proxy-agent');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const {v4: uuidv4} = require('uuid');
//const Discord = require('discord.js');

axiosCookieJarSupport(axios);
//const cookieJar = new tough.CookieJar();

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36';

async function sendToSlackBeta(config, site, locations){
    console.log('sendToSlackBeta start');   

    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
    
    const headers = {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json; charset=UTF-8',
    };

    const data = {
        channel: config.channelId,
        ts: config.timestamp,
        text: '',
        link_names: true,
        unfurl_links: true,
        attachments: [
            {
                text: site,
            }
        ]
    };

    const options = {
        headers: headers,
        //httpsAgent: proxyAgent,
    };

    let newAvailability = false;
    for(location of locations){
        if(true === location.appointmentsAvailable){
            data.text += `:large_green_circle: Walgreens ${location.state} Locations\n`;
            if(true === location.newAvailability){
                newAvailability = true;
            }
        }
        else{
            data.text += `:red_circle: Walgreens ${location.state} Locations\n`;
        }
    }
    if(true === newAvailability){
        data.text += '@here';
    }

    let url = 'https://slack.com/api/chat.update';

    await axios.post(url, JSON.stringify(data), options)
    .then((response) => {
        console.log(response.data);
    })
    .catch((err) => {
        console.log(err);
    });

    console.log('sendToSlackBeta end');

}

async function sendToSlack(config, site, state){
    console.log('sendToSlack start');   

    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
    
    const headers = {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json; charset=UTF-8',
    };

    const data = {
        channel: config.channelId,
        text: `New Availability at Walgreens ${state} Locations`,
        unfurl_links: true,
        attachments: [
            {
                text: site,
            }
        ]
    };

    const options = {
        headers: headers,
        //httpsAgent: proxyAgent,
    };

    let url = 'https://slack.com/api/chat.postMessage';

    await axios.post(url, JSON.stringify(data), options)
    .then((response) => {
        console.log(response.data);
    })
    .catch((err) => {
        console.log(err);
    });

    console.log('sendToSlack end');

}

async function initSlackChannel(config){
    console.log('initSlackChannel start');

    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');

    let headers = {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    let options = {
        headers: headers,
        //httpsAgent: proxyAgent,
    };

    let query = {
        types: 'public_channel,private_channel',
    };

    options.params = query;

    /* Get the channel ID to post appointment availability to */

    let responseData = {};
    config.channelId = '';
    let url = 'https://slack.com/api/conversations.list';
    await axios.get(url, options)
    .then((response) => {
        //console.log(response.data);
        responseData = response.data;
    })
    .catch((err) => {
        console.log(err);
        console.log('Failed to get slack channels');
    });

    for(channel of responseData.channels){
        if(config.channelName === channel.name){
            config.channelId = channel.id;
        }
    }
    if('' === config.channelId){
        console.log('Failed to get channel ID');
    }
    else{
        console.log('Got channel ID');
    }

    /* 
     * Send an initial post which will be updated periodically as
     * new appointments become available.
     */
    headers = {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json; charset=UTF-8',
    };

    const data = {
        channel: config.channelId,
        text: 'Walgreens Monitor Init',
    };
    
    options = {
        headers: headers,
        //httpsAgent: proxyAgent,
    };

    url = 'https://slack.com/api/chat.postMessage';

    config.timestamp = ''
    await axios.post(url, JSON.stringify(data), options)
    .then((response) => {
        console.log(response.data);
        config.timestamp = response.data.ts;
    })
    .catch((err) => {
        console.log(err);
    });

    if('' === config.timestamp){
        console.log('Failed to get message timestamp');
    }
    else{
        console.log('Got message timestamp');
    }


    console.log('initSlackChannel end');
}

async function transferCookiesToJar(cookies, jar){
    console.log('transferCookiesToJar start');

    let domain = '';

    cookies.forEach((cookie) => {
        
        domain = cookie.domain.includes('www')?`https://${cookie.domain}`:`https://www${cookie.domain}`;
        console.log(`${cookie.name}=${cookie.value}, domain:${cookie.domain}`);
        jar.setCookie(`${cookie.name}=${cookie.value}`, domain);
        /*
        jar.setCookie(tough.Cookie.fromJSON(
                {
                    key: cookie.name,
                    value: cookie.value,
                }
            ),
            `https://${cookie.domain}`
        );
        */
    });

    console.log(JSON.stringify(jar.toJSON()));

    console.log('transferCookiesToJar end');
}

async function getAppointments(config){
    console.log('getAppointments start');

    let timeout = 0;
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
    
    const transactionId = uuidv4();

    const headers = {
        'user-agent': userAgent,
        'accept': 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'referer': `${config.site}${config.availabilityPath}`,
        'origin': `${config.site}/`,
        'content-type': 'application/json; charset=UTF-8',
        'transactionid': transactionId,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\"; v=\"89\",\";Not A Brand\"; v=\"99\"',
        'sec-ch-ua-mobile': '?0',
        'content-type': 'application/json; charset=UTF-8',
    };

    const options = {
        headers: headers,
        httpsAgent: proxyAgent,
        jar: config.cookieJar,
        //withCredentials: true,
    };

    let url = config.site + config.appointmentPath;
    console.log(url);
    let responseData = {};
    let payload = {};
    const dateObject = new Date();
    const dateFormat = ('0'  + dateObject.getDate()).slice(-2);
    const monthFormat = ('0' + (dateObject.getMonth()+1)).slice(-2);
    const yearFormat = dateObject.getFullYear();

    for(coordinates of config.coordinatePairings){
        payload = {
            appointmentAvailability: {
                startDateTime: `${yearFormat}-${monthFormat}-${dateFormat}`
            },
            availabilityGroup: 'TeacherChildSupport',
            position: {
                latitude: coordinates.latitude,
                longitude: coordinates.longitude
            },
            radius: 25,
            serviceId: '99',
            size: 25,
            state: coordinates.state,
            vaccine: {
                productId: ''
            }
        };

        responseData = {}
        await axios.post(url, JSON.stringify(payload), options)
        .then((response) => {
            console.log(response.data);
            responseData = response.data;
        })
        .catch((err) => {
            console.log(err);
            console.log('Failed to get appoinments');
        });

        config.appointments = {};
        
    }
    console.log('getAppointments end');    
}

async function login(config){
    console.log('login start');

    let timeout = 0;

    /* Get a handle to the browser */
    let page = config.page;

    const url = config.site + config.loginPath;

    /* Navigate to login page */
    await page.goto(url).catch((err) => {
        console.log(err);
        console.log('Failed to access Walgreens login page');
        config.sessionAvailable = false;
        return;
    });

    /* Wait for 2-4 seconds beteween entering username and password */
    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    await page.click('#user_name').catch((err) => {
        console.log(err);
        console.log('Failed to click username textbox');
        config.loginSuccess = false;
        return;
    });

    /* Delay in between keystrokes to make typing more human-like */
    timeout = Math.round(Math.random()*(300-100))+100;
    await page.keyboard.type(config.userName, {delay: timeout}).catch((err) => {
        console.log(err);
        console.log('Failed to type username');
        config.loginSuccess = false;
        return;
    });
   
    /* Wait for 2-4 seconds beteween entering username and password */
    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    await page.click('#user_password').catch((err) => {
        console.log(err);
        console.log('Failed to click username textbox');
        config.loginSuccess = false;
        return;
    });

    /* Delay in between keystrokes to make typing more human-like */
    timeout = Math.round(Math.random()*(300-100))+100;
    await page.keyboard.type(config.userPassword, {delay: timeout}).catch((err) => {
        console.log(err);
        console.log('Failed to type username');
        config.loginSuccess = false;
        return;
    });
    
    /* Wait for 2-4 seconds beteween entering username and password */

    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    await page.click('#submit_btn').catch((err) => {
        console.log(err);
        console.log('Failed to click username textbox');
        config.loginSuccess = false;
        return;
    });

    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    let cookies = await page.cookies();
    transferCookiesToJar(cookies, config.cookieJar);

    config.loginSuccess = true;
    console.log('login end');
}

async function getAvailability(config){
    console.log('getAvailability start');

    config.available = false;

    const page = config.page;

    /* Intercept requests */
    await page.setRequestInterception(true);

    await page.on('response', (response) => {
        if(config.site+config.availabilityPath === response.url()){
            config.available = response.appointmentsAvailable;
        }
    });

    let timeout = 0;
    while(false === config.available){
        await page.click('#inputLocation').catch((err) => {
            console.log(err);
            console.log('Failed to type zip code');
            config.available = false;
        });

        /* Delay in between keystrokes to make typing more human-like */
        /*
        timeout = Math.round(Math.random()*(300-100))+100;
        await page.keyboard.type('20723', {delay: timeout}).catch((err) => {
            console.log(err);
            console.log('Failed to type zip code');
            config.available = false;
            return;
        });
        */
        await page.keyboard.press('Enter').catch((err) => {
            console.log(err);
            console.log('Failed to type zip code');
            config.available = false;
        });

       timeout = Math.round(Math.random()*(10000-7500))+7500;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r=> setTimeout(r, timeout));  
    }

    await page.removeAllListeners('response');

    console.log('getAvailability end');

    return;
    
    //let timeout = 0;
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');

    const headers = {
        'user-agent': userAgent,
        'accept': 'application/json, text/plain, *//*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'origin': config.site,
        'referer': `${config.site}${config.screeningPath}`,
        'x-xsrf-token': config.xsrfToken,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\"; v=\"89\",\";Not A Brand\"; v=\"99\"',
        'sec-ch-ua-mobile': '?0',
        'content-type': 'application/json; charset=UTF-8'
    };

    const options = {
        headers: headers,
        httpsAgent: proxyAgent,
        jar: config.cookieJar,
    };

    let url = '';
    let responseData = {};
    let payload = {};
    const dateObject = new Date();
    const dateFormat = ('0'  + dateObject.getDate()).slice(-2);
    const monthFormat = ('0' + (dateObject.getMonth()+1)).slice(-2);
    const yearFormat = dateObject.getFullYear();
    for(coordinates of config.coordinatePairings){
        timeout = Math.round(Math.random()*(10000-7500))+7500;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));

        payload = {
            appointmentAvailability: {
            startDateTime: `${yearFormat}-${monthFormat}-${dateFormat}`
        },
        position: {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
        },
            radius: 25,
            serviceId: '99'
        };

        responseData = {};
        url = config.site + config.availabilityPath;
        await axios.post(url, JSON.stringify(payload), options)
        .then((response) => {
            console.log(response.data);
            responseData = response.data;
        })
        .catch((err) => {
            console.log(err);
            console.log('Error checking availability');
            return;
        });

        //coordinates.appointmentsAvailable = (responseData.appointmentsAvailable ? true : false);

        if(true === responseData.appointmentsAvailable){
            coordinates.count++;
            if((coordinates.count > 2) && (false === coordinates.appointmentsAvailable)){
                coordinates.appointmentsAvailable = true;
                coordinates.newAvailability = true;
            }
            else if((coordinates.count > 2) && (true === coordinates.appointmentsAvailable)){
                coordinates.newAvailability = false;
            }
            else{
                coordinates.appointmentsAvailable = false;
                coordinates.newAvailability = false;
            }
        }
        else{
            coordinates.count = 0;
            coordinates.appointmentsAvailable = false;
            coordinates.newAvailability = false;
        }
        
        if(true === responseData.appointmentsAvailable){
            config.appointmentsAvailable = true;
            console.log('Found appointments');
            url = config.site + config.screeningPath;
            await sendToSlack(config.slack, url, coordinates.state);
        }
        else{
            console.log('No new appoinments found');
        }

    }
    url = config.site + config.screeningPath;
    await sendToSlackBeta(config.slack, url, config.coordinatePairings);

    console.log('getAvailability end');

}

async function init(config){
    console.log('init start');

    /* Get a handle to the browser */
    let page = config.page;

    /* Navigate to Walgreens main page to build up some browsing data */
    await page.goto(config.site).catch((err) => {
        console.log(err);
        console.log('Failed to access Walgreens main page');
        config.sessionAvailable = false;
        return;
    });

    /* Navigate to COVID-19 screening page to get an XSRF token */
    await page.goto(config.site + config.screeningPath).catch((err) => {
        console.log(err);
        console.log('Failed to access COVID-19 screening page');
        config.sessionAvailable = false;
        return;
    });

    let html = await page.content();
    let $ = cheerio.load(html);

    /* Parse XSRF token */
    config.xsrfToken = $('meta[name=_csrf]').attr('content');
    console.log(config.xsrfToken);

    /* Store session cookies to bypass Akamai protection */
    let sessionCookies = await page.cookies();
    config.cookieJar = new tough.CookieJar();
    await transferCookiesToJar(sessionCookies, config.cookieJar);

    config.sessionAvailable = true;

    /* Initialize slack channel for reporting */
    initSlackChannel(config.slack);


    console.log('init end');
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
    /*
    let proxy = circularBufferGet(config.proxies).split(':');

    const ip = proxy.shift();
    const port = proxy.shift();
    const user = proxy.shift();
    const pass = proxy.shift();
    */
    /* Reformat to user:pass@ip:port */
    //config.currProxy = await proxyChain.anonymizeProxy('http://' + user + ':' + pass + '@' + ip + ':' + port);
    //console.log(config.currProxy);
    const currProxy = '127.0.0.1:8080';

    /* Spin up a new puppeteer browser */
    const browser = await puppeteer.launch({
        //args: ['--no-sandbox','--window-size=1280,1024','--disable-infobars'],
        args: ['--no-sandbox','--window-size=1280,1024','--disable-infobars',`--proxy-server=${currProxy}`],
        headless: false,
        ignoreHTTPSErrors: true
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

async function main(){

    let config = {};
    config.laTaniereWebhook = '';
    config.theLeagueWebhook = '';
    config.zipCode = '20723';

    await getPageHandle(config);

    config.site = 'https://www.walgreens.com';
    config.screeningPath = '/findcare/vaccination/covid-19/location-screening';
    config.availabilityPath = '/hcschedulersvc/svc/v1/immunizationLocations/availability';
    config.appointmentPath = '/hcschedulersvc/svc/v2/immunizationLocations/timeslots';
    config.loginPath = '/login.jsp';
    config.coordinatePairings = [
        {
            state: 'MD',
            appointmentsAvailable: false,
            newAvailability: false,
            latitude: 39.13844226728303,
            longitude: -76.85796090607508,
            count: 0,
        },
        {
            state: 'VA',
            appointmentsAvailable: false,
            newAvailability: false,
            latitude: 38.775166830149736, 
            longitude: -77.28386884471882,
            count: 0,
        }
    ];
    config.slack = {
        channelName: 'webhook-test',
        token : '',
    };
    console.log(JSON.stringify(config.slack));
    config.userName = '';
    config.userPassword = '';
    
    
    let timeout = 0;

    config.sessionAvailable = false;
    while(true){
        /* Get session cookies and XSRF token */
        while(false === config.sessionAvailable){
            await init(config)
            .catch((err) => {
                console.log(err);
                console.log('Error getting session');
            });
            timeout = Math.round(Math.random()*(12000-6000))+6000;
            console.log(`Sleeping for ${timeout} milliseconds while getting session`);
            await new Promise(r=> setTimeout(r, timeout));        
        }

        /* Wait until appointments are available */
        config.appointmentsAvailable = false;
        while(false === config.appointmentsAvailable){
            await getAvailability(config)
            .catch((err) => {
                console.log(err);
                console.log('Error checking availability');
                process.exit(0);
            });
            timeout = Math.round(Math.random()*(10000-7500))+7500;
            console.log(`Sleeping for ${timeout} milliseconds`);
            await new Promise(r=> setTimeout(r, timeout));
        }
    }

        /* Login to Walgreens once appointment is available */
        config.loginSuccess = false;
        while(false === config.loginSuccess){
            await login(config).catch((err) => {
                console.log(err);
            });
        }

        /* 
         * Get a listing of all locations and appointment times that are
         * available
        */
        await getAppointments(config);
        process.exit(0);


    //}
        
    /* Login to Walgreens once appointment is available */
    config.loginSuccess = false;
    while(false === config.loginSuccess){
        await login(config).catch((err) => {
            console.log(err);
        });
    }

    /* 
     * Get a listing of all locations and appointment times that are
     * available
    */
    await getAppointments(config);
    
}

if (require.main === module){
    main();
}

