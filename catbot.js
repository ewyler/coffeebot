'use strict';

///////////// Requires

require('babel-polyfill');

const Botkit = require('botkit');
const express = require('express')
const schedule = require('node-schedule')
const promisify = require('promisify-node')

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

///////////// Scheduled stuff

const EACH_DAY_AT_MIDNIGHT = '0 0 * * *'

schedule.scheduleJob(EACH_DAY_AT_MIDNIGHT, function() {
    // This will reset any users wanting coffee and also do randomization of free coffee at some point
    console.log('poops');
});

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

// States here could be cleaned up a little, but it works

class CoffeeManager {
    constructor(bot) {
        this.bot = bot;
        this.currentState = null;

        // Could do this lazily but we may as well do it right away.
        this.getCurrentState().catch(err => console.error(err));
    }

    async getCurrentState() {
        if (this.currentState === null) {
            const resp = await this.bot.api.channels.list({});

            const coffeeChannel = resp.channels.find(channel => channel.name == 'coffee');
            if (!coffeeChannel) {
                throw "I can't work without a coffee channel!";
            }

            console.log("Found the coffee channel!");
            console.log(coffeeChannel);

            this.currentState = new EmptyCoffeeState(coffeeChannel.id, this.bot);
        }

        return this.currentState;
    }

    async processCoffeeMessage(message) {
        const currentState = await this.getCurrentState();
        this.currentState = currentState.processCoffeeMessage(message);
    }
}

class EmptyCoffeeState {
    constructor(coffeeChannelId, bot) {
        this.coffeeChannelId = coffeeChannelId;
        this.bot = bot;
    }

    async processCoffeeMessage(message) {
        this.bot.reply(message, 'I will send coffee on a great steed. You are now in the queue.');

        await this.bot.api.chat.postMessage(
            {
                as_user: true,
                channel: this.coffeeChannelId,
                text: `Someone needs coffee! Who is up to the task?`
            }
        );

        return new UserNeedsCoffeeState(this.coffeeChannelId, this.bot, message.user);
    }
}

class UserNeedsCoffeeState {
    constructor(coffeeChannelId, bot, userId) {
        this.coffeeChannelId = coffeeChannelId;
        this.bot = bot;
        this.originalUserId = userId;
    }

    async processCoffeeMessage(message) {
        if (this.originalUserId == message.user) {
            this.bot.reply(message, "I beg thee, please give thy steed time! You are in the queue.");
            return this;
        }

        // A lot of this can be parallelized, but for easy of dev and error propogation ease, just leave it sync
        // Also slack doesn't like lots of fast API calls.

        // Get info about the original user
        const originalUserResp = await this.bot.api.users.info({ user: this.originalUserId });

        ////////////////
        // Message the recently requesting user
        this.bot.reply(
            message,
            `Caffeine be upon you. You are paired with @${originalUserResp.user.name}! Go and burst forth enlightening conversation.`
        );

        ////////////////
        // Message the original user

        // Get Catbot's IM with the original user
        const imListing = await this.bot.api.im.list({});
        const originalUserIm = imListing.ims.find(im => im.user == this.originalUserId);

        // Get info about the latest user
        const latestUserResp = await this.bot.api.users.info({ user: message.user })

        await this.bot.api.chat.postMessage(
            {
                as_user: true,
                channel: originalUserIm.id,
                text: `Caffeine be upon you. You are paired with @${latestUserResp.user.name}! Go and burst forth enlightening conversation.`
            },
        );

        await this.bot.api.chat.postMessage(
            {
                as_user: true,
                channel: this.coffeeChannelId,
                text: `@${originalUserResp.user.name} and @${latestUserResp.user.name} are getting coffee together!`
            },
        );

        return new EmptyCoffeeState(this.coffeeChannelId, this.bot);
    }
}

const controller = Botkit.slackbot({
    debug: false
});

const bot = controller.spawn({
    token: process.env.SLACK_TOKEN
}).startRTM();

const coffeeManager = new CoffeeManager(new PromiseBot(bot));

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
    ['.*'],
    'direct_message,direct_mention,mention',
    (bot, message) => {
        bot.reply(message, 'Your wishes confuse me.');
    }
);
