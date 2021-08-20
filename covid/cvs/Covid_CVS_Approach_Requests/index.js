process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
/* nodejs request library */
const axios = require('axios');
axios.defaults.withCredentials=true;
const httpsProxyAgent = require('https-proxy-agent');
const discord = require('discord.js');

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.96 Safari/537.36';

/*const sitesToMonitor = ['ALEXANDRIA', 'ANNANDALE', 'ARLINGTON', 'ASHBURN',
'BAILEYS CROSSROADS', 'BURKE', 'CHANTILLY', 'DALE CITY', 'DUMFRIES', 'FAIRFAX',
'FALLS CHURCH', 'GREAT FALLS', 'HERNDON', 'MANASSAS', 'RESTON', 'ROSSLYN',
'STAFFORD', 'STERLING', 'VIENNA', 'WOODBRIDGE', 'ANNAPOLIS', 'ASHTON',
'BALTIMORE', 'BELTSVILLE', 'BETHESDA', 'BOWIE', 'BURTONSVILLE', 'CHEVY CHASE',
'CLARKSVILLE', 'COLLEGE PARK', 'COLUMBIA', 'DERWOOD', 'FULTON', 'GAITHERSBURG',
'GLEN BURNIE', 'LAUREL', 'OXON HILL', 'ROCKVILLE', 'SEVERN', 'SEVERNA PARK',
'SILVER SPRING', 'WHEATON'];*/

const originalLogFunction = console.log;
/* Overwrite and customize console.log function */
console.log = function(){
    const args = [].slice.call(arguments);
    originalLogFunction.apply(this,[getTimeStamp()].concat(args));
};

/* Return the current timestamp */
function getTimeStamp(){
    const dateObj =  new Date();
    const year = dateObj.getFullYear();
    const date = (`0${dateObj.getDate()}`).slice(-2);
    const month = (`0${dateObj.getMonth()+1}`).slice(-2);
    const hours = (`0${dateObj.getHours()}`).slice(-2);
    const minutes = (`0${dateObj.getMinutes()}`).slice(-2);
    const seconds = (`0${dateObj.getSeconds()}`).slice(-2);
    const millis = (`00${dateObj.getMilliseconds()}`).slice(-3);
    return `[${year}-${month}-${date} ${hours}:${minutes}:${seconds},${millis}]`;
}

async function sendToDiscord(config){
    console.log('sendToDiscord start');
    console.log(`Discord ID: ${config.discord.id}`);
    console.log(`Discord Token: ${config.discord.token}`);
    console.log(`State: ${config.state}`);
    console.log(`Locations ${config.locations}`);
    console.log(`URL: ${config.url}`);
    const webhook = await new discord.WebhookClient(config.discord.id, config.discord.token);
    
    const embed = await new discord.MessageEmbed();
    embed.setTitle('CVS');
    embed.setColor('#0099ff')
    embed.addFields(
        {
            name: `${config.state} Locations`,
            value: config.locations,
            inline: true
        },
        {
            name: 'URL',
            value: config.url,
            inline: false
        }
    );
    
    await webhook.send({
        username: 'JARVIS',
        embeds:[embed]
    });

    console.log('sendToDiscord end');
   
}

async function sendToSlack(webhook, url, availability){
   
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');

    const headers = {
        'content-type': 'application/json'
    }

    const data = {
        username: `CVS ${availability.state} Locations`,
        icon_emoji: ':syringe:',
        attachments: [
            {
                color: '#9733EE',
                fields: [
                    {
                        title: 'New CVS Pharmacy Appointments Available',
                        value: `Locations ${availability.availableSites.toString()}`,
                    }
                ]
            }
        ],
        text: `${url}`,
    };

    /*
    const options = {
        httpsAgent: proxyAgent, 
    };
    */
    console.log(JSON.stringify(data));
    return;

    await axios.post(webhook, JSON.stringify(data))
    .then((response) => {
        console.log('Successful post to slack');
    })
    .catch((err) => {
        console.log('Failed to post to Slack');
    });
}

async function isEqual(a, b){
    let rv = true;
    let includes = false;
    console.log('isEqual start');
    if(a.length === b.length){
        a.forEach((objA) => {
            includes = b.includes(objA.toString());
            if(!(includes)){
                console.log('Lists do not match');
                rv = false;
            }
        });
        b.forEach((objB) => {
            includes = a.includes(objB.toString());
            if(!(includes)){
                console.log('Lists do not match');
                rv = false;
            }
        });
    }
    else{
        console.log('Lists do not match');
        rv = false;
    }
    console.log('isEqual end');
    return rv;
}

async function getAvailability(config){
    console.log('getAvailability start');
    
    let timeout = 0;
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
    
    const headers = {
        'user-agent': userAgent,
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'referer': config.url ,
        'content-type': 'application/x-www-form-urlencoded',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\"; v=\"89\",\";Not A Brand\"; v=\"99\"',
        'sec-ch-ua-mobile': '?0',
    };

    const query = {
        vaccine: '',
    };
   
    const options = {
        headers: headers,
        //httpsAgent: proxyAgent,
        params: query,
        //jar: cookieJar,
        withCredentials: true,
    };

    let url = '';
    //let availableSites = [];
    let currAvailability = {};
    let rv = false;
    let includes = false;
    let responseData = {};
    let availabilityCheckError = false;
    for(loc of config.locationsToCheck){
        currAvailability = [];
        url = `${config.availabilityLink}.${loc.state}.json`         

        availabilityCheckError = false;
        await axios.get(url, options)
        .then((response) => {
            responseData = response.data;
        }).catch((err) => {
            console.log('Error checking availability.');
            /*
             * These are known error responses that can be resolved with
             * a brief timeout and continuation of execution
             */
            const errConditions = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'];
            if(errConditions.includes(err.code)){
                availabilityCheckError = true;
            }
            else{
                console.log(err);
                throw new Error('Error checking availability');
            }
        });
        if(availabilityCheckError){
            timeout = Math.round(Math.random()*(10000-7500))+7500;
            console.log(`Sleeping for ${timeout} milliseconds after error`);
            await new Promise(r=> setTimeout(r, timeout));
            continue;
        }
       
        for(site of responseData.responsePayloadData.data[loc.state]){
            if("Fully Booked" !== site.status){
                currAvailability.push(site.city.toString());
            }
        }

        /* Only report sites that users are interested in */
        currAvailability = currAvailability.filter((site) => {
            return loc.sitesToMonitor.includes(site.toString());
        });

        rv = await isEqual(loc.availableSites, currAvailability);
        if(!(rv)){
            /* Add any newly available sites */
            currAvailability.forEach((site) => {
                includes = loc.availableSites.includes(site.toString());
                if(!(includes)){
                    loc.availableSites.push(site.toString());
                }
            });
            /* Remove any sites that are no longer showing availability */
            console.log(`${loc.state} availability before: ${loc.availableSites}`);
            loc.availableSites = loc.availableSites.filter((site) => {
                return currAvailability.includes(site.toString());
            });
            console.log(`${loc.state} availability after: ${loc.availableSites}`);
            if(loc.availableSites.length > 0){
                console.log('Sending new availability to Discord');
                sendToDiscord({
                    discord: config.discord,
                    state: loc.state,
                    locations: loc.availableSites,
                    url: config.url,
                });
            }
            else{
                console.log('No availability to report');
            }
        }
        else{
            console.log(`No new availability in ${loc.state}`);
        }

        console.log(`${loc.state} availability: ${loc.availableSites.toString()}`);

        timeout = Math.round(Math.random()*(10000-7500))+7500;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r=> setTimeout(r, timeout));
    }
        
    console.log('getAvailability end');
}

async function init(config){
    console.log('init start');
    
    let proxyAgent = httpsProxyAgent('http://127.0.0.1:8080');
    
    const headers = {
        'user-agent': userAgent,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\"; v=\"89\",\";Not A Brand\"; v=\"99\"',
        'sec-ch-ua-mobile': '?0',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'referer': 'www.google.com',
        'upgrade-insecure-requests': '1',
    };

    const options = {
        headers: headers,
        //httpsAgent: proxyAgent,
        //jar: cookieJar,
        withCredentials: true,
    };

    await axios.get(config.url, options)
    .then(function (response){
        console.log('Got session');
        config.sessionAvailable = true;
    })
    .catch(function (err){
        console.log('Failed to get session');
    });

    console.log('init end');
   
}

async function main(){

    let config = {};
    config.discord = {
        id: '',
        token: ''
    };
    config.url = 'https://www.cvs.com/immunizations/covid-19-vaccine';
    config.availabilityLink = 'https://www.cvs.com/immunizations/covid-19-vaccine.vaccine-status';
    config.locationsToCheck = [
        {
            state:'MD',
            availableSites: [],
            sitesToMonitor: ['ANNAPOLIS', 'ASHTON',
'BALTIMORE', 'BELTSVILLE', 'BETHESDA', 'BOWIE', 'BURTONSVILLE', 'CHEVY CHASE',
'CLARKSVILLE', 'COLLEGE PARK', 'COLUMBIA', 'DERWOOD', 'FULTON', 'GAITHERSBURG',
'GLEN BURNIE', 'LAUREL', 'OXON HILL', 'ROCKVILLE', 'SEVERN', 'SEVERNA PARK',
'SILVER SPRING', 'WHEATON'],
        },
        {
            state:'VA',
            availableSites: [],
            sitesToMonitor: ['ALEXANDRIA', 'ANNANDALE', 'ARLINGTON', 'ASHBURN',
'BAILEYS CROSSROADS', 'BURKE', 'CHANTILLY', 'DALE CITY', 'DUMFRIES', 'FAIRFAX',
'FALLS CHURCH', 'GREAT FALLS', 'HERNDON', 'MANASSAS', 'RESTON', 'ROSSLYN',
'STAFFORD', 'STERLING', 'VIENNA', 'WOODBRIDGE'],
        }
    ];
    
    let timeout = 0;
    /*
    config.sessionAvailable = false;
    while(false === config.sessionAvailable){
        await init(config)
        .catch((err) => {
            console.log('Error getting session');
        });
        timeout = Math.round(Math.random()*(12000-6000))+6000;
        console.log(`Sleeping for ${timeout} milliseconds while getting session`);
        await new Promise(r=> setTimeout(r, timeout));        
    }
    */
    while(true){
        await getAvailability(config)
        .catch((err) => {
            console.log(err);
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

if (require.main === module){
    main();
}

