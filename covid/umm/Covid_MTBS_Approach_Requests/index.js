process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
/* nodejs request library */
const axios = require('axios');
axios.defaults.withCredentials=true;
const qs = require('qs');
const httpsProxyAgent = require('https-proxy-agent');
const cheerio = require('cheerio');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const Discord = require('discord.js');

axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.96 Safari/537.36';

async function sendToDiscord(config){

    const webhook = await new Discord.WebhookClient(config.webhookID,
config.webhookToken);
    const embed = await new Discord.MessageEmbed();
    embed.setTitle('Vaccine Alert')
    .setColor('#0099ff')
    .setURL(config.url)
    .setFooter('webscraping');

    await webhook.send('@here', {
        embeds: [embed]
    });
}

async function sendToSlack(config){
   
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
 
    const payload = {
        username: 'MTBS',
        text: config.url,
    };

    const options = {
        httpsAgent: proxyAgent, 
    };

    await axios.post(config.slackWebhook, JSON.stringify(payload), options)
    .then((response) => {
        console.log('Successful post to slack');
    })
    .catch((err) => {
        console.log('Failed to post to Slack');
    });
	const friendGroupWebhook = '';
    await axios.post(friendGroupWebhook, JSON.stringify(payload))
    .then((response) => {
        console.log('Successful post to slack');
    })
    .catch((err) => {
        console.log('Failed to post to Slack');
    });
}

async function getDateRange(config){
    console.log('getDateString start');

    let dateObject = new Date();
    let monthFormat = '';
    let dateFormat = '';
    let yearFormat = '';
    let dateRange = [];
    
    let month = dateObject.getMonth();
    let date = dateObject.getDate()+1;
    let i = 0;
    for(i = month; i < ((month+3)%11); i++){
        while(date < 32){
            dateFormat = ('0' + date).slice(-2);
            monthFormat = ('0' + (i+1)).slice(-2);
            yearFormat = dateObject.getFullYear();
            /* Format dates as YYYY-MM-DD */
            console.log(`${yearFormat}-${monthFormat}-${dateFormat}`);
            dateRange.push(`${yearFormat}-${monthFormat}-${dateFormat}`);
            date += 7;
        }
        /* Adjust the date based on the month */
        switch (i){
            case 0:
            case 2:
            case 4:
            case 6:
            case 7:
            case 9:
            case 11:
                date %= 31;
                break;
            case 3:
            case 5:
            case 8:
            case 10:
                date %= 30;
                break;
            case 1:
                if(0 == (dateObject.getYear()%4)){
                    /* leap year */
                    date %= 29;
                }
                else{
                    /* non-leap year */
                    date %= 28;
                }
                break;
            default:
                throw new Error('Invalid month');
                break;
        }

    }

    config.dateRange = dateRange;

    console.log('getDateString end');
}

async function getAvailability(config){
    console.log('getAvailability start');
    
    let timeout = 0;
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
    
    const headers = {
        'User-Agent': userAgent,
        'Accept': '*/*',
        'X-Requested-With':'XMLHttpRequest',
        '__RequestVerificationToken': config.requestVerificationToken,
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://signupandschedule.umm.edu',
        'Referer': config.url,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Connection': 'keep-alive',
    };

    getDateRange(config);
    
    query = {
        noCache: Math.random()
    };
   
    const options = {
        headers: headers,
        httpsAgent: proxyAgent,
        jar: cookieJar,
        withCredentials: true,
    };

    for(const dateString of config.dateRange){
        const formData = {
            id: 'RES^84002860',
            vt: '22759',
            view: 'grouped',
            start: dateString,
            filters: JSON.stringify({
                Providers: {
                    'RES^84002860': true
                },
                Departments: {
                    2010017206: true
                },
                DaysOfWeek: {
                    0: true,
                    1: true,
                    2: true,
                    3: true,
                    4: true,
                    5: true,
                    6: true
                },
                TimesOfDay: "both"
            })
        };

        query = {
            noCache: Math.random()
        };

        options.params = query;

        await axios.post(config.availabilityLink, qs.stringify(formData), options)
        .then(function(response){
            console.log(response.data);
            if(null === response.data.AllDays){
                console.log('No appointments available. Sleeping...');
                config.appointmentsAvailable = false;
            }
            else if(0 === Object.keys(response.data.AllDays).length){
                console.log('No appointments available. Sleeping...');
                config.appointmentsAvailable = false;
            }
            else{
                console.log('Availability found!');
                config.appointmentsAvailable = true;
                sendToDiscord(config);
                sendToSlack(config);
            }
        }).catch(function(err){
            console.log(err);
        });
        timeout = Math.round(Math.random()*(12000-6000))+6000;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));
       
    }

    console.log('getAvailability end');

}

async function getSession(config){
    console.log('getSession start');
    
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
    
    const headers = {
        'user-agent': userAgent,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'sec-fetch-site': 'none',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-user': '?1',
        'connection': 'keep-alive'
    };

    /*
    const query = {
        'id': 'RES^84002860',
        'VT': '22759'
    };
    */
    
    const options = {
        headers: headers,
        //params: query,
        httpsAgent: proxyAgent,
        jar: cookieJar,
        withCredentials: true,
    };

    await axios.get(config.url, options)
    .then(function (response){
        let $ = cheerio.load(response.data);
        config.requestVerificationToken =
$('input[name=__RequestVerificationToken]').attr('value');
        console.log(config.requestVerificationToken);
        console.log('Got session');
        config.sessionAvailable = true;
    })
    .catch(function (err){
        console.log('Failed to get session');
    });

    console.log('getSession end');
   
}

async function main(){

    let config = {};
    config.webhookID = '';
    config.webhookToken = '';
    config.slackWebhook = '';
    config.url = 'https://signupandschedule.umm.edu/mychart/SignUpAndSchedule/EmbeddedSchedule?id=RES^84002860&VT=22759';
    config.availabilityLink = 'https://signupandschedule.umm.edu/MyChart/OpenScheduling/OpenScheduling/GetOpeningsForProvider';
    
    let timeout = 0;
    config.sessionAvailable = false;
    while(false === config.sessionAvailable){
        await getSession(config)
        .catch((err) => {
            console.log('Error getting session');
        });
        timeout = Math.round(Math.random()*(12000-6000))+6000;
        console.log(`Sleeping for ${timeout} milliseconds while getting session`);
        await new Promise(r=> setTimeout(r, timeout));        
    }
    while(true){
        config.appointmentsAvailable = false;
        while(false === config.appointmentsAvailable){
            await getAvailability(config)
            .catch((err) => {
                console.log('Error checking availability');
                process.exit(0);
            });
            timeout = Math.round(Math.random()*(10000-7500))+7500;
            console.log(`Sleeping for ${timeout} milliseconds`);
            await new Promise(r=> setTimeout(r, timeout));
        }
        timeout = Math.round(Math.random()*(120000-60000))+60000;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));
    }
}

if (require.main === module){
    main();
}

