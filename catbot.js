'use strict';

///////////// Requires

require('babel-polyfill');

const Botkit = require('botkit');
const express = require('express')
const schedule = require('node-schedule')
const promisify = require('promisify-node')

const AutoMerger = require('./auto-merger.js');
const CoffeeManager = require('./coffee-manager.js');

///////////// App setup
// Bullshit way to make this work because Procfile only works with web roles,
// so there is no way to specify a non-web role. As such, we have to create
// something to listen to port 5000 or else heroku will kill the app after 60 seconds.

const app = express()

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

app.get('/', function(request, response) {
    response.send('Hello World!')
})

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'))
})

///////////// Promisified bot things

class PromiseBot {
    constructor(bot) {
        this.bot = bot;
    }

    get api() {
        return {
            channels: {
                list: promisify(this.bot.api.channels.list)
            },
            chat: {
                postMessage: promisify(this.bot.api.chat.postMessage)
            },
            im: {
                list: promisify(this.bot.api.im.list)
            },
            users: {
                info: promisify(this.bot.api.users.info)
            }
        }
    }

    reply(message, text) {
        this.bot.reply(message, text);
    }
}

///////////// Real cod

const controller = Botkit.slackbot({
    debug: false
});

const bot = controller.spawn({
    token: process.env.SLACK_TOKEN
}).startRTM();

const coffeeManager = new CoffeeManager(new PromiseBot(bot));
const autoMerger = new AutoMerger(process.env.GITHUB_USERNAME, process.env.GITHUB_PASSWORD);

///////////// Scheduled stuff

const EACH_DAY_AT_MIDNIGHT = '0 0 * * *';

schedule.scheduleJob(EACH_DAY_AT_MIDNIGHT, function() {
    console.log('Commence poop reset');
    coffeeManager.reset();
});

const EVERY_3_MINUTES = '*/3 * * * *';
const REPOS = ['hn-core', 'hn-webpack', 'hn-nerd-experience', 'hn-enterprise-portal', 'hn-marketing-sales'];

schedule.scheduleJob(EVERY_3_MINUTES, function() {
    console.log('Auto-pooping');
    for (const repo of REPOS) {
        autoMerger.mergeApprovedPullRequests(repo);
    }
});

///////////// Bot listening commands

controller.hears(
    ['coffee'],
    'direct_message,direct_mention,mention',
    async (bot, message) => {
        try {
            await coffeeManager.processCoffeeMessage(message);
        } catch (err) {
            console.error(err);
        }
    }
);

controller.hears(
    ['will do it'],
    'direct_message,direct_mention,mention',
    async (bot, message) => {
        bot.reply(message, "My life for aiur.")
    }
);

controller.hears(
    ['.*'],
    'direct_message,direct_mention,mention',
    (bot, message) => {
        bot.reply(message, 'Your wishes confuse me.');
    }
);
