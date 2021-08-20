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
const proxyChain = require('proxy-chain');
const got = require('got');
const fs = require('fs');
const tls = require('tls');
const discord = require('discord.js');
let config = require('./config.json');

tls.DEFAULT_MIN_VERSION = 'TLSv1.3';

axiosCookieJarSupport(axios);

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36';

/* Overwrite and customize console.log function */
const originalLogFunction = console.log;
console.log = function(){
    const args = [].slice.call(arguments);
    originalLogFunction.apply(console.log, [getTimeStamp()].concat(args));
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

async function sendToSlack_(config, site, locations){
    console.log('sendToSlack_ start');   

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

    console.log('sendToSlack_ end');

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

async function sendToDiscord(locations){
    console.log('sendToDiscord start');

    const webhook = await new discord.WebhookClient(config.discord.id, config.discord.token);
    
    const embed = await new discord.MessageEmbed();
    embed.setTitle('Walgreens');
    embed.setColor('#0099ff')
    embed.addFields(
        {
            name: 'Locations',
            value: locations,
            inline: true
        },
        {
            name: 'URL',
            value: `${config.site}${config.screeningPath}`,
            inline: false
        }
    );
    
    await webhook.send({
        username: 'VAXSEEN',
        embeds:[embed]
    });

    console.log('sendToDiscord end');
}

async function sendToDiscord_(locations){
     console.log('sendToDiscord_ start');

    const webhook = await new discord.WebhookClient(config.discord.testId, config.discord.testToken);
    
    const embed = await new discord.MessageEmbed();
    embed.setTitle('Walgreens');
    embed.setColor('#0099ff')
    embed.addFields(
        {
            name: 'Locations',
            value: locations,
            inline: true
        },
        {
            name: 'URL',
            value: `${config.site}${config.screeningPath}`,
            inline: false
        }
    );
    
    await webhook.send({
        username: 'JARVIS',
        embeds:[embed]
    });

    console.log('sendToDiscord_ end');
   
}

async function reportError(message){
    console.log(`${arguments.callee.name} start`);

    const id = '';
    const token = '';
    const webhook = await new discord.WebhookClient(id, token);
    
    const embed = await new discord.MessageEmbed();
    embed.setTitle('Error');
    embed.setColor('#0099ff')
    embed.addFields(
        {
            name: 'Walgreens Monitor Error',
            value: message,
            inline: false
        }
    );
    
    await webhook.send('@here', {
        username: 'JARVIS',
        embeds:[embed]
    });

    console.log(`${arguments.callee.name} end`);
   
}

function circularBufferGet(list){

    let obj = list.shift();
    list.push(obj);
    return obj;
}

async function isEqual(a, b){
    console.log('isEqual start');
    let includes = false;
    let rv = true;
    console.log(`Length A: ${a.length} Length B: ${b.length}`);
    if(a.length === b.length){
        a.forEach((objA) => {
            includes = b.includes(objA.toString());
            if(!(includes)){
                rv = false;
            }
        });
        b.forEach((objB) => {
            includes = a.includes(objB.toString());
            if(!(includes)){
                rv = false;
            }
        });
       
        console.log(`RV after second inclusion check: ${rv}`);
    }
    else{
        console.log('Lists do not match in length');
        rv = false;
    }
    console.log('isEqual end');
    return rv;
}

async function transferCookiesToJar(cookies, jar){
    console.log('transferCookiesToJar start');

    let domain = '';

    cookies.forEach((cookie) => {
        
        domain = cookie.domain.includes('www')?`https://${cookie.domain}`:`https://www${cookie.domain}`;
        //console.log(`${cookie.name}=${cookie.value}, domain:${cookie.domain}`);
        jar.setCookie(`${cookie.name}=${cookie.value}`, domain);
    });

    console.log('transferCookiesToJar end');
}
async function patchEngagementData(config){
    console.log('patchEngagementData start');

    let timeout = 0;
    let proxyAgent = httpsProxyAgent(config.currProxy);
    const transactionId = uuidv4();

    const headers = {
        'user-agent': userAgent,
        'accept': 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'referer': 'https://www.walgreens.com/findcare/vaccination/covid-19/appointment/patient-info',
        'origin': config.site,
        'content-type': 'application/json; charset=UTF-8',
        'transactionid': transactionId,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\"; v=\"89\",\";Not A Brand\"; v=\"99\"',
        'sec-ch-ua-mobile': '?0',
        'content-type': 'application/json; charset=UTF-8',
        'x-dtpc': config.dtpc,
    };

    let url = config.site+config.engagementPath;
    
    let options = {
        headers: headers,
        httpsAgent: proxyAgent,
        jar: config.cookieJar,
    };
    
    let responseData = {};
    await axios.patch(url, config.engagementData, options)
    .then((response) => {
        console.log(response.status);
        responseData = response.data;
    })
    .catch((err) => {
        console.log(err);
        console.log('Error patching engagement data');
        throw new Error('Error patching engagement data');
    });

    console.log('patchEngagementData end');
}


async function putPatientData(config){
    console.log('putPatientData start');

    let timeout = 0;
    let proxyAgent = httpsProxyAgent(config.currProxy);
    const transactionId = uuidv4();

    const headers = {
        'user-agent': userAgent,
        'accept': 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'referer': 'https://www.walgreens.com/findcare/vaccination/covid-19/appointment/patient-info',
        'origin': config.site,
        'content-type': 'application/json; charset=UTF-8',
        'transactionid': transactionId,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\"; v=\"89\",\";Not A Brand\"; v=\"99\"',
        'sec-ch-ua-mobile': '?0',
        'content-type': 'application/json; charset=UTF-8',
        'x-dtpc': config.dtpc,
    };

    let url = config.site+config.patientPath;
    
    let options = {
        headers: headers,
        httpsAgent: proxyAgent,
        jar: config.cookieJar,
    };
    
    let responseData = {};
    await axios.put(url, config.patientData, options)
    .then((response) => {
        console.log(response.status);
        responseData = response.data;
    })
    .catch((err) => {
        console.log(err);
        console.log('Error uploading patient data');
        throw new Error('Error uploading patient data');
    });

    console.log('putPatientData end');
}

async function postScreeningResults(config){
    console.log('postScreeningResults start');

    let timeout = 0;
    let proxyAgent = httpsProxyAgent(config.currProxy);

    /* Get the x-dtpc header from the corresponding cookie */
    let dtpc = '';
    config.cookieJar.store.findCookie('www.walgreens.com', '/', 'dtPC',
        (err,cookie) => {
            dtpc = cookie.value;
        }
    );
    if('' === dtpc){
        console.log('dtPC cookie missing from cookie jar');
        process.exit(0);
    }
    else{
        config.dtpc = dtpc;
    }

    const transactionId = uuidv4();

    const headers = {
        'user-agent': userAgent,
        'accept': 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'referer': 'https://www.walgreens.com/findcare/vaccination/covid-19/appointment/screening',
        'origin': config.site,
        'content-type': 'application/json; charset=UTF-8',
        'transactionid': transactionId,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\"; v=\"89\",\";Not A Brand\"; v=\"99\"',
        'sec-ch-ua-mobile': '?0',
        'content-type': 'application/json; charset=UTF-8',
        'x-dtpc': config.dtpc,
    };

    let url = config.site+config.screeningResultsPath;
    
    let options = {
        headers: headers,
        httpsAgent: proxyAgent,
        jar: config.cookieJar,
    };

    let responseData = {};
    await axios.post(url, config.screeningResults, options)
    .then((response) => {
        responseData = response.data;
    })
    .catch((err) => {
        console.log(`Error status code: ${err.response.status}`);
        console.log('Error posting screening results');
        throw new Error('Error posting screening results');
    });
  
    config.patientData.engagementId = responseData.engagementId; 
    config.engagementData.engagementId = responseData.engagementId; 
    console.log(`engagementId: ${responseData.engagementId}`);

    console.log('postScreeningResults end');
}

async function getAppointments(config){
    console.log('getAppointments start');

    let timeout = 0;
    let proxyAgent = httpsProxyAgent(config.currProxy);
    
    const transactionId = uuidv4();

    const headers = {
        'user-agent': userAgent,
        'accept': 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'referer': `${config.site}${config.nextAvailable}`,
        'origin': config.site,
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
    };

    let url = config.site + config.appointmentPath;
    //console.log(url);
    let responseData = {};
    let payload = {};
    const dateObject = new Date();
    const dateFormat = ('0'  + dateObject.getDate()).slice(-2);
    const monthFormat = ('0' + (dateObject.getMonth()+1)).slice(-2);
    const yearFormat = dateObject.getFullYear();

    config.appointmentsFound = false;
    for(coordinates of config.coordinatePairings){
        let currAvailability = [];
        let availability = coordinates.availability;
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

        responseData = {};
        await axios.post(url, payload, options)
        .then((response) => {
            //console.log(response.data);
            responseData = response.data;
        })
        .catch((err) => {
            if(401 === err.response.status){
                console.log('Session expired');
                throw new Error('Session expired');   
            }
            else if(404 === err.response.status){
                console.log('Appointments not available in selected region');
                responseData = err.response.data;
            }
            else{
                //console.log(err);
                console.log('Failed to get appoinments');
                throw new Error('Failed to get appointments');
            }
        });

        let siteAddress = '';
        let appointments = '';
        /* Make sure appointments are available */
        if(undefined !== responseData.locations){
            config.appointmentsFound = true;
            /* Iterate over each site, and record various information */
            for(site of responseData.locations){
                /*
                 * Get the vaccine manufacturer names for each vaccine
                 * being offered at the site
                 */
                let manufacturers = site.manufacturer.pop().name;
                while((site.manufacturer.length > 0)){
                    manufacturers += `, ${site.manufacturer.pop().name}`;
                }
    
                /*
                 * Record the site address and corresponding 
                 * available vaccine(s) 
                 */
                siteAddress = `${site.address.line1}, ${site.address.city}`
                siteAddress += `, ${site.address.state} ${site.address.zip}`;
                siteAddress += ` (${manufacturers})`;
                currAvailability.push(siteAddress.toString());

                /* Record any available timeslots at the particular site */
                appointments = `${siteAddress}\n`;
                /* Iterate over each timeslot*/
                for(appointment of site.appointmentAvailability){
                    appointments += `${appointment.date}\n`;
                    for(slot of appointment.slots){
                        appointments += `[${slot}]`;
                    }
                    appointments += '\n';
                }
                /*
                 * Send detailed vaccine availability to test discord
                 * webhook
                 */
                //await sendToDiscord_(appointments);
            }
            //console.log(currAvailability.toString());
            /* Check current availability against reported availability */
            let rv = await isEqual(availability, currAvailability);
            if(!(rv)){
                let includes = false;
                /* Update the list with new locations showing availablity */
                currAvailability.forEach((addr) => {
                    includes = availability.includes(addr.toString());
                    if(!(includes)){
                        availability.push(addr.toString());
                    }
                });
                console.log(`# Sites Before Check: ${availability.length}`);
                availability.forEach((addr) => {
                    let index = 0;
                    includes = currAvailability.includes(addr.toString());
                    if(!(includes)){
                        console.log(`Removing ${addr.toString()}`);
                        index = availability.indexOf(addr.toString());
                        availability.splice(index, 1);
                    }
                });
                console.log(`# Sites After Check: ${availability.length}`);
                /* Format the availability and send to discord */
                console.log(`${coordinates.state} Availability:\n`);
                appointments = '';
                availability.forEach((addr) => {
                    appointments += `${addr}\n`;
                });
                if('MD' === coordinates.state){
                    /* Only MD availability goes to VAXSEEN */
                    await sendToDiscord(appointments);
                }
                /* Send all availability to LaTaniere webhook */
                await sendToDiscord_(appointments);
                
                console.log(appointments);
                console.log('Sending to discord');
            }
        }
        /* Check error messages */
        else if(undefined !== responseData.error){
            for(error of responseData.error){
                if('Insufficient inventory.' === error.message.toString()){
                    console.log(`Appointments not available (${coordinates.state})`);
                }
            }
        }
        else{
            throw new Error('Unknown response');
        }
    }
    console.log('getAppointments end');    
}

async function login(config){
    console.log('login start');

    let timeout = 0;
    let mfaRequired = false;
    let passedLoginScreen = false;
    let lock = true;

    /* Get a handle to the browser */
    let page = config.page;

    /* Navigate to Walgreens main page to build up some browsing data */
    await page.goto(config.site)
    .catch((err) => {
        console.log(err);
        console.log('Failed to access Walgreens main page');
        config.loginSuccess = false;
        config.error = true;
        throw new Error('Failed to access Walgreens main page');
    });

    let url = config.site + config.loginPath;

    /*
     * Navigate to login page
     * This step frequently introduces ERR_SSL_PROTOCOL_ERROR or 
     * ERR_TUNNEL_CONNECTION_FAILED errors, which need to be tracked
     * and debugged. These errors result in a halt of execution altogether.
     * A page refresh appears to mitigate this issue.
     */
    let loadError = true;
    while(loadError === true){
        await page.goto(url)
        .then(() => {
            loadError = false;
        })
        .catch((err) => {
            loadError = ((err.message.includes('ERR_SSL_PROTOCOL_ERROR')) || (err.message.includes('ERR_TUNNEL_CONNECTION_FAILED')));
            console.log(`Message: ${err.message}`);
            console.log(`Stack: ${err.stack}`);
            console.log('Failed to access Walgreens login page');
            if(loadError){
                /* Report error to discord */
                console.log(`${arguments.callee.name}, ${config.currProxy}, ${err.message}`);
                reportError(`${config.currProxy}:${err.message}`); 
            }
            else{
                config.sessionAvailable = false;
                config.error = true;
                throw new Error('Failed to access Walgreens login page');
            }
        })
         if(loadError){
            /* Wait for 2-4 seconds before refreshing page */
            timeout = Math.round(Math.random()*(4000-2000))+2000;
            console.log(`Sleeping for ${timeout} milliseconds`);
            await new Promise(r => setTimeout(r, timeout));
            await page.reload()
            .catch((err) => {
                throw new Error('Multiple errors on accessing login page');
            });
        }
    }
    /*
    await page.goto(url)
    .catch((err) => {
        loadError = ((err.message.includes('ERR_SSL_PROTOCOL_ERROR')) || (err.message.includes('ERR_TUNNEL_CONNECTION_FAILED')));
        //console.log(`Code: ${err.code}`);
        console.log(`Message: ${err.message}`);
        console.log(`Stack: ${err.stack}`);
        //console.log(err);
        console.log('Failed to access Walgreens login page');
        //config.sessionAvailable = false;
        //config.error = true;
        if(loadError){
            // Report error to discord
            console.log(`${arguments.callee.name}, ${config.currProxy}, ${err.message}`);
            reportError(`${config.currProxy}:${err.message}`); 
        }
        else{
            config.sessionAvailable = false;
            config.error = true;
            throw new Error('Failed to access Walgreens login page');
        }
    })
    .then(async () => {
        if(loadError){
            // Wait for 2-4 seconds before refreshing page
            timeout = Math.round(Math.random()*(4000-2000))+2000;
            console.log(`Sleeping for ${timeout} milliseconds`);
            await new Promise(r => setTimeout(r, timeout));
            await page.reload()
            .catch((err) => {
                throw new Error('Multiple errors on accessing login page');
            });
        }
    })
    .catch((err) => {
        console.log('Multiple errors on accessing login page');
        throw new Error(err);
    });
    */
    /* Wait for 2-4 seconds between entering username and password */
    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    await page.click('#user_name')
    .catch((err) => {
        console.log(err);
        console.log('Failed to click username textbox');
        config.loginSuccess = false;
        config.error = true;
        throw new Error('Failed to click username textbox');
    });

    /* Delay in between keystrokes to make typing more human-like */
    timeout = Math.round(Math.random()*(300-100))+100;
    await page.keyboard.type(config.userName, {delay: timeout})
    .catch((err) => {
        console.log(err);
        console.log('Failed to type username');
        config.loginSuccess = false;
        config.error = true;
        throw new Error('Failed to type username');
    });
   
    /* Wait for 2-4 seconds beteween entering username and password */
    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    await page.click('#user_password')
    .catch((err) => {
        console.log(err);
        console.log('Failed to click password textbox');
        config.loginSuccess = false;
        config.error = true;
        throw new Error('Failed to click password textbox');
    });

    /* Delay in between keystrokes to make typing more human-like */
    timeout = Math.round(Math.random()*(300-100))+100;
    await page.keyboard.type(config.password, {delay: timeout})
    .catch((err) => {
        console.log(err);
        console.log('Failed to type password');
        config.loginSuccess = false;
        config.error = true;
        throw new Error('Failed to type password');
    });

    /* Enable request interception before clicking submit button*/
    await page.setRequestInterception(true);

    page.on('request', async (request) => {
        request.continue();
    });

    /* Inspect response in case MFA occurs or Akamai blocks login*/
    page.on('response', async (response) => {
        url = `${config.site}${config.loginVerificationPath}`;
        if(url === response.url()){
            if(403 === response.status()){
                loginSuccess = false;
            }
            else if(200 === response.status()){
                let responseData = await response.json();
                let messages = responseData.messages;
                console.log(JSON.stringify(messages));
                if(undefined !== messages){
                    for(message of messages){
                        console.log(JSON.stringify(message));
                        if('2FA required' === message.message){
                            console.log('MFA required');
                            mfaRequired = true;
                            console.log('Here first');
                        }
                    }
                }
                await page.removeAllListeners('response');
                passedLoginScreen = true;
            }
            else{
                console.log(`Login status unknown: ${response.status()}`);
            }
        }
    });
    /* Wait for 2-4 seconds after entering username and password */
    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    passedLoginScreen = false;
    while(passedLoginScreen === false){
        await page.click('#submit_btn')
        .catch(async (err) => {
            console.log(err);
            console.log('Failed to click username textbox');
            config.loginSuccess = false;
            await page.reload();
        });
        timeout = Math.round(Math.random()*(4000-2000))+2000;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));
    }
   
    /* Wait for 2-4 seconds after logging in */  
    timeout = Math.round(Math.random()*(4000-2000))+2000;
    console.log(`Sleeping for ${timeout} milliseconds`);
    await new Promise(r => setTimeout(r, timeout));

    console.log('Here second');
    if(true ===  mfaRequired){
        /* Multifactor authentication required */
        //await page.waitForNavigation({waitUntil: 'domcontentloaded'});
        
        /* Wait for 2-4 seconds before clicking button */
        timeout = Math.round(Math.random()*(4000-2000))+2000;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));

        await page.click('#radio-security')
        .catch((err) => {
            console.log(err);
            console.log('Failed to click mfa radio button');
            config.loginSuccess = false;
            config.error = true;
            throw new Error('Failed to click mfa radio button');
        });

        /* Wait for 2-4 seconds before clicking button */
        timeout = Math.round(Math.random()*(4000-2000))+2000;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));

        await page.click('#optionContinue')
        .catch((err) => {
            console.log(err);
            console.log('Failed to click mfa continue button');
            config.loginSuccess = false;
            config.error = true;
            throw new Error('Failed to click mfa continue button');;
        });

        /* Wait for 2-4 seconds before entering mfa response */
        timeout = Math.round(Math.random()*(4000-2000))+2000;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));

        await page.click('#secQues')
        .catch((err) => {
            console.log(err);
            console.log('Failed to click security question textbox');
            config.loginSuccess = false;
            config.error = true;
            throw new Error('Failed to click security question textbox');
        });

        /* Delay in between keystrokes to make typing more human-like */
        timeout = Math.round(Math.random()*(300-100))+100;
        await page.keyboard.type(config.mfaResponse, {delay: timeout})
        .catch((err) => {
            console.log(err);
            console.log('Failed to type mfa response');
            config.loginSuccess = false;
            config.error = true;
            throw new Error('Failed to type mfa response');
        });

        /* Wait for 2-4 seconds before clicking button */
        timeout = Math.round(Math.random()*(4000-2000))+2000;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));

        await page.click('#validate_security_answer')
        .catch((err) => {
            console.log(err);
            console.log('Failed to click mfa validate response button');
            config.loginSuccess = false;
            config.error = true;
            throw new Error('Failed to click mfa validate response button');
        });

    }

    /* Disable request interception after login */
    //await page.removeAllListeners('response');

    let cookies = await page.cookies();
    await transferCookiesToJar(cookies, config.cookieJar);

    config.loginSuccess = true;
    console.log('login end');
}

async function getAvailability(config){
    console.log('getAvailability start');
    
    let timeout = 0;
    let proxyAgent = httpsProxyAgent(config.currProxy);
    headers = {
        'user-agent': userAgent,
        'accept': 'application/json, text/plain, */*',
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

    let options = {
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
        await axios.post(url, payload, options)
        .then((response) => {
            console.log(response.data);
            responseData = response.data;
        })
        .catch((err) => {
            //console.log(err);
            //console.log(err.request.connection.getProtocol());
            console.log('Error checking availability');
            config.error = true;
            throw new Error('getAvailability error');
        });

        if(true === responseData.appointmentsAvailable){
            config.appointmentsAvailable = true;
            console.log('Found appointments');
            url = config.site + config.screeningPath;
            //await sendToSlack(config.slack, url, coordinates.state);
        }
        else{
            console.log('No new appoinments found');
        }

    }
    //url = config.site + config.screeningPath;
    //await sendToSlackBeta(config.slack, url, config.coordinatePairings);

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
    if(undefined === config.xsrfToken){
        console.log('Failed to get XSRF token');
        config.error = true;
        throw new Error('Error on init, could not parse XSRF token');
    }
    console.log(config.xsrfToken);

    /* Store session cookies to bypass Akamai protection */
    let sessionCookies = await page.cookies();
    config.cookieJar = new tough.CookieJar();
    await transferCookiesToJar(sessionCookies, config.cookieJar);
    
    /* Initialize slack channel for reporting */
    //initSlackChannel(config.slack);

    config.sessionAvailable = true;

    console.log('init end');
}

/*
 * Using techniques taken from
 * https://intoli.com/blog/not-possible-to-block-chrome-headless/
 * to bypass some basic headless Chrome checks performed by website antibot
 * protections
 */
const preparePage = async (page) => {
    // Pass the User-Agent Test.
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

    /* Trying out some other antibot bypasses mentioned on intolli website */
    //WebGL Vendor and Renderer
    await page.evaluateOnNewDocument(() => {
        const getParameter = WebGLRenderingContext.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // UNMASKED_VENDOR_WEBGL
          if (parameter === 37445) {
            return 'Intel Open Source Technology Center';
          }
          // UNMASKED_RENDERER_WEBGL
          if (parameter === 37446) {
            return 'Mesa DRI Intel(R) Ivybridge Mobile ';
          }

          return getParameter(parameter);
        };
    });

    //Broken Image
    await page.evaluateOnNewDocument(() => {
        ['height', 'width'].forEach(property => {
          // store the existing descriptor
          const imageDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, property);

          // redefine the property with a patched descriptor
          Object.defineProperty(HTMLImageElement.prototype, property, {
            ...imageDescriptor,
            get: function() {
              // return an arbitrary non-zero dimension if the image failed to load
              if (this.complete && this.naturalHeight == 0) {
                return 20;
              }
              // otherwise, return the actual dimension
              return imageDescriptor.get.apply(this);
            },
          });
        });
    });

    await page.evaluateOnNewDocument(() => {
        window.onbeforeunload= ((a) => {
            "undefined"!==typeof sessionStorage&&sessionStorage.removeItem("distil_referrer");
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
    //config.currProxy = 'http://127.0.0.1:8080';
    config.currProxy = `http://${user}:${pass}@${ip}:${port}`;
    let anonymizedProxy  = await proxyChain.anonymizeProxy(config.currProxy);

    //let anonymizedProxy = '127.0.0.1:8080';

    /* Spin up a new puppeteer browser */
    const browser = await puppeteer.launch({
        //args: ['--no-sandbox','--window-size=1280,1024', 'disable-infobars'],
        args: ['--no-sandbox','--window-size=1280,1024','--disable-infobars',`--proxy-server=${anonymizedProxy}`],
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
    
    config.laTaniereWebhook = '';
    config.theLeagueWebhook = '';

    /* Track any incidental error conditions that might occur */
    config.error = false;

    /* Various paths needed for scraping Walgreens website */
    config.site = 'https://www.walgreens.com';
    config.screeningPath = '/findcare/vaccination/covid-19/location-screening';
    config.availabilityPath = '/hcschedulersvc/svc/v1/immunizationLocations/availability';
    config.loginVerificationPath = '/profile/v1/login';
    config.nextAvailable= '/findcare/vaccination/covid-19/appointment/next-available';
    config.appointmentPath = '/hcschedulersvc/svc/v2/immunizationLocations/timeslots';
    config.loginPath = '/login.jsp';
    config.screeningResultsPath = '/hcimmunizationsvc/svc/v1/engagement/screeningResults';
    config.patientPath = `/hcimmunizationsvc/svc/v1/patient/${config.patientData.patientId}`;
    config.engagementPath = '/hcimmunizationsvc/svc/v1/engagement';

    /* List of all loations to check for vaccine availability */
    config.coordinatePairings = [
        {
            state: 'MD',
            appointmentsAvailable: false,
            newAvailability: false,
            latitude: 39.13844226728303,
            longitude: -76.85796090607508,
            availability: [],
        },
        {
            state: 'VA',
            appointmentsAvailable: false,
            newAvailability: false,
            latitude: 38.775166830149736, 
            longitude: -77.28386884471882,
            availability: [],
        }
    ];
    config.slack = {
        channelName: 'webhook-test',
        token : '',
    };
    
    let timeout = 0;

    config.sessionAvailable = false;
    while(true){
        /* Get session cookies and XSRF token */
        while(false === config.sessionAvailable){
            /* Initialize puppeteer instance and store session data */
            await getPageHandle(config);
            await init(config)
            .catch((err) => {
                console.log(err);
                console.log('Error getting session');
            });
            if(config.error){
                break;
            }
            timeout = Math.round(Math.random()*(12000-6000))+6000;
            console.log(`Sleeping for ${timeout} milliseconds while getting session`);
            await new Promise(r=> setTimeout(r, timeout));        
        }
        if(config.error){
            config.error = false;
            config.sessionAvailable = false;
            config.appointmentsAvailable = false;
            /* Close the active puppeteer session before re-initializing */
            await config.page.close()
            .catch((err) => {
                console.log('Error while closing page');
            });
            await config.browser.process().kill('SIGINT');
            await config.browser.close()
            .catch((err) => {
                console.log('Error while closing browser');
            });
            console.log('Error occurred, restarting monitor...');
            continue;
        }
      
        /* Wait until appointments are available */
        config.appointmentsAvailable = false;
        while(false === config.appointmentsAvailable){
            await getAvailability(config)
            .catch((err) => {
                console.log(err);
                console.log('Error checking availability');
            });
            if(config.error){
                break;
            }
            timeout = Math.round(Math.random()*(10000-7500))+7500;
            console.log(`Sleeping for ${timeout} milliseconds`);
            await new Promise(r=> setTimeout(r, timeout));
        }
        if(config.error){
            config.error = false;
            config.sessionAvailable = false;
            config.appointmentsAvailable = false;
            /* Close the active puppeteer session before re-initializing */
            await config.page.close()
            .catch((err) => {
                console.log('Error while closing page');
            });
            await config.browser.process().kill('SIGINT');
            await config.browser.close()
            .catch((err) => {
                console.log('Error while closing browser');
            });
            console.log('Error occurred, restarting monitor...');
            continue;
        }

        /* Login to Walgreens once appointment is available */
        config.loginSuccess = false;
        while(false === config.loginSuccess){
            await login(config)
            .catch((err) => {
                console.log(err);
            });
            if(config.error){
                console.log('Breaking login loop.');
                break;
            }
        }
        if(config.error){
            console.log('Error occurred on login, restarting everything...');
            config.error = false;
            config.sessionAvailable = false;
            config.appointmentsAvailable = false;
            /* Close the active puppeteer session before re-initializing */
            console.log('Closing page');
            await config.page.close()
            .catch((err) => {
                console.log('Error while closing page');
            });
            console.log('Closing browser');
            await config.browser.process().kill('SIGINT');
            await config.browser.close()
            .catch((err) => {
                console.log('Error while closing browser');
            });
            console.log('Error occurred, restarting monitor...');
            continue;
        }

        config.sessionActive = true;
        while(true === config.sessionActive){
            await postScreeningResults(config).catch((err) => {
                console.log(err);
                console.log('Failed to post screening results');
                config.sessionActive = false;
            });
            if(true === config.sessionActive){
                timeout = Math.round(Math.random()*(10000-7500))+7500;
                console.log(`Sleeping for ${timeout} milliseconds`);
                await new Promise(r=> setTimeout(r, timeout));
            }
            else{
                break;
            }

            await putPatientData(config).catch((err) => {
                console.log(err);
                console.log('Failed to put patient data');
                config.sessionActive = false;
            });
            if(true === config.sessionActive){
                timeout = Math.round(Math.random()*(10000-7500))+7500;
                console.log(`Sleeping for ${timeout} milliseconds`);
                await new Promise(r=> setTimeout(r, timeout));
            }
            else{
                break;
            }

            await patchEngagementData(config).catch((err) => {
                console.log(err);
                console.log('Failed to patch data');
                config.sessionActive = false;
            });
            if(true === config.sessionActive){
                timeout = Math.round(Math.random()*(10000-7500))+7500;
                console.log(`Sleeping for ${timeout} milliseconds`);
                await new Promise(r=> setTimeout(r, timeout));
            }
            else{
                break;
            }
       
            while(true === config.sessionActive){
                await getAppointments(config).catch((err) => {
                    console.log(err);
                    console.log('Failed to get appointments');
                    config.sessionActive = false;
                });
                if(true === config.appointmentsFound){
                    /* Sleep 7.5-10 seconds before checking for new appointments */
                    timeout = Math.round(Math.random()*(10000-7500))+7500;
                    console.log(`Sleeping for ${timeout} milliseconds`);
                    await new Promise(r=> setTimeout(r, timeout));
                }
                else{
                    console.log('Appointments not found');
                    /* Sleep 7.5-10 seconds before checking for new appointments */
                    timeout = Math.round(Math.random()*(10000-7500))+7500;
                    console.log(`Sleeping for ${timeout} milliseconds`);
                    await new Promise(r=> setTimeout(r, timeout));
                }
            }
        }
        /* Close the active puppeteer session before re-initializing */
        config.sessionAvailable = false;
        config.appointmentsAvailable = false;
        /*await config.page.close()
        .catch((err) => {
            console.log('Error while closing page');
        });*/
        let pages = await config.browser.pages();
        await Promise.all(pages.map(page => page.close()));
        await config.browser.close()
        .catch((err) => {
            console.log('Error while closing browser');
        });
    }
}

if (require.main === module){
    main();
}

