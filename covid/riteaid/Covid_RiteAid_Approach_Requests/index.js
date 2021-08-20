process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
/* nodejs request library */
const axios = require('axios').default;
axios.defaults.withCredentials=true;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const qs = require('qs');
const httpsProxyAgent = require('https-proxy-agent');
const cheerio = require('cheerio');
const proxyChain = require('proxy-chain');
const tls = require('tls');
const discord = require('discord.js');
const asyncMutex = require('async-mutex').Mutex;
tls.DEFAULT_MIN_VERSION = 'TLSv1.3';

axiosCookieJarSupport(axios);

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36';


async function sendToDiscord(config){
    console.log('sendToDiscord start');

    const webhook = await new discord.WebhookClient(config.discord.id, config.discord.token);
    
    const embed = await new discord.MessageEmbed();

    let stores = [];
    let address = '';
    for(store of config.stores){
        console.log('sendToDiscord acquiring lock');
        const release = await config.mutex.acquire();
        if(store.available){
            /* Reset store count to avoid too many pings */
            store.available = false;
            store.count = 0;
            address = `${store.address} ${store.city}, ${store.state} ${store.zip}`
            console.log(`Reporting availability for ${address}`);
            stores.push(address);
        }
        console.log('sendToDiscord releasing lock');
        release();
        console.log('sendToDiscord released lock');
    };

    if(stores.length > 0){
        embed.setTitle('Rite Aid');
        embed.setColor('#0099ff')
        embed.addFields(
            {
                name: `Locations`,
                value: stores,
                inline: true
            },
            {
                name: 'URL',
                value: 'https://www.riteaid.com',
                inline: false
            }
        );
        
        await webhook.send({
            username: 'JARVIS',
            embeds:[embed]
        }); 
    }
    else{
        console.log('No availability to report');
    }

    console.log('sendToDiscord end');
}

async function getTimeSlots(config){
    console.log('getTimeSlots start');

    let timeout = 0;
    
    const proxyAgent = httpsProxyAgent(config.currProxy);

    const url = 'https://www.riteaid.com/services/ext/v2/vaccine/checkSlots';

    const headers = {
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\";v=\"89\", \";Not A Brand\";v=\"99\"',
        'accept': '*/*',
        'x-requested-with': 'XMLHttpRequest',
        'sec-ch-ua-mobile': '?0',
        'user-agent': userAgent,        
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'referer': 'https://www.riteaid.com/pharmacy/apt-scheduler',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
    };


    let params = {};

    for(store of config.stores){
        params.storeNumber = store.num;
        
        let options = {
            headers: headers,
            httpsAgent: proxyAgent,
            params: params,
        };

        let responseData = {};
        await axios.get(url, options)
        .then((response) => {
            responseData = response.data;
        })
        .catch((err) => {
            console.log(err);
        });

        if((responseData.Data.slots['1']) || (responseData.Data.slots['2'])){
            /* Increment count of availablity */
            console.log(`Incrementing availability count for ${store.address}`);
            console.log(`${arguments.callee.name} acquiring lock`);
            const release = await config.mutex.acquire();
            store.count += 1;
            console.log(`${arguments.callee.name} releasing lock`);
            release();
            console.log(`${arguments.callee.name} released lock`);
        }
        else{
            /* Reset count of positive availability */
            console.log(`Resetting availability count for ${store.address}`);
            console.log(`${arguments.callee.name} acquiring lock`);
            const release = await config.mutex.acquire();
            store.count = 0;
            store.available = false;
            console.log(`${arguments.callee.name} releasing lock`);
            release();
            console.log(`${arguments.callee.name} released lock`);
        }
    
        /*
         * If the store shows availability for 5 or more cycles,
         * report availability at the store
         */
        if(store.count > 4){
            console.log(`Availability found at ${store.address}`);
            console.log(`${arguments.callee.name} acquiring lock`);
            const release = await config.mutex.acquire()
            store.available = true;
            console.log(`${arguments.callee.name} releasing lock`);
            release();
            console.log(`${arguments.callee.name} released lock`);
        }
    
        /* Wait for 7.5-10 seconds beteween entering username and password */
        timeout = Math.round(Math.random()*(10000-7500))+7500;
        console.log(`Sleeping for ${timeout} milliseconds`);
        await new Promise(r => setTimeout(r, timeout));
    };

    console.log('getTimeSlots end');
}

async function getStores(config){
    console.log('getStores start');

    const proxyAgent = httpsProxyAgent(config.currProxy);

    const headers = {
        'sec-ch-ua': '\"Google Chrome\";v=\"89\", \"Chromium\";v=\"89\", \";Not A Brand\";v=\"99\"',
        'accept': '*/*',
        'x-requested-with': 'XMLHttpRequest',
        'sec-ch-ua-mobile': '?0',
        'user-agent': userAgent,        
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'referer': 'https://www.riteaid.com/pharmacy/apt-scheduler',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
    };

    const url = 'https://www.riteaid.com/services/ext/v2/stores/getStores';

    for(loc of config.locations){
        let responseData = {};
        
        const params = {
            address: loc.zip,
            attrFilter: 'PREF-112',
            fetchMechanismVersion: '2',
            radius: '50'
        };
        
        const options = {
            headers: headers,
            httpsAgent: proxyAgent,
            params: params, 
        };

        await axios.get(url, options)
        .then((response) => {
            responseData = response.data;
        })
        .catch((err) => {
            console.log(err);
        });

        config.stores= [];
        for(store of responseData.Data.stores){
            config.stores.push(
                {
                    num: store.storeNumber.toString(),
                    address: store.address.toString(),
                    city: store.city.toString(),
                    zip: store.fullZipCode.toString(),
                    state: loc.state,
                    available: false,
                    count: 0,
                }
            );
        }
    }

    console.log(JSON.stringify(config.stores));

    console.log('getStores end');
}

async function init(config){
    console.log('init start');

    config.currProxy = 'http://127.0.0.1:8080';

    console.log('init end');
}

async function main(){
    console.log('main start');
    
    let config = {};

    config.mutex = new asyncMutex();
    config.discord = {
        id: '',
        token: ''
    };

    config.locations = [
        {
            state: 'MD',
            zip: '20723',
        },
    ];

    await init(config);

    await getStores(config);

    /* Kick off discord reporter */
    const interval = 60000;
    setInterval(sendToDiscord, interval, config); 
    while(true){
        await getTimeSlots(config);
    }

    console.log('main end');
}

if(require.main === module){
    main();
}
