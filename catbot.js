'use strict';

///////////// Requires

require('babel-polyfill');

const Botkit = require('botkit');
const express = require('express');
const schedule = require('node-schedule');
const promisify = require('promisify-node');

const CoffeeManager = require('./coffee-manager.js');

///////////// App setup

const app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
    res.send('Poop');
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});

///////////// Botpoop

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
                info: promisify(this.bot.api.users.info),
                list: promisify(this.bot.api.users.list)
            }
        }
    }

    reply(message, text) {
        this.bot.reply(message, text);
    }
}

const controller = Botkit.slackbot({
    debug: false
});

const bot = controller.spawn({
    token: process.env.SLACK_TOKEN
}).startRTM();

///////////// Coffee

(() => {
    const coffeeManager = new CoffeeManager(new PromiseBot(bot));

    // This is all UTC right now, so make it right for EST. Will be off an hour
    // during DST unless this is updated, but whatever.
    const EACH_DAY_AT_MIDNIGHT = '0 4 * * *';
    const EACH_WEEKDAY_AT_10AM = '0 14 * * 1-5';

    schedule.scheduleJob(EACH_WEEKDAY_AT_10AM, function() {
        console.log('Pooping out daily random coffee');
        coffeeManager.assignRandomCoffeePairing();
    });

    controller.hears(
        ['do it, super secretly'],
        'direct_message,direct_mention,mention',
        async (bot, message) => {
            try {
                coffeeManager.assignRandomCoffeePairing();
            } catch (err) {
                console.error(err);
            }
        }
    );

    schedule.scheduleJob(EACH_DAY_AT_MIDNIGHT, function() {
        console.log('Commence poop reset');
        coffeeManager.reset();
    });

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
})();

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
