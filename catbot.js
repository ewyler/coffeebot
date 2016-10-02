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

EACH_DAY_AT_MIDNIGHT = '0 0 * * *'

schedule.scheduleJob(EACH_DAY_AT_MIDNIGHT, function() {
    console.log('poops');
});

///////////// Global setup crap

const controller = Botkit.slackbot({
    debug: false
});

const bot = controller.spawn({
    token: process.env.SLACK_TOKEN
}).startRTM();

const coffeeData = {
    userIdNeedingCoffee: null
}

///////////// Promisified things

const pbot = {
    api: {
        channels: {
            list: promisify(bot.api.channels.list)
        },
        chat: {
            postMessage: promisify(bot.api.chat.postMessage)
        },
        im: {
            list: promisify(bot.api.im.list)
        },
        users: {
            info: promisify(bot.api.users.info)
        }
    }
}

///////////// Real cod

const processCoffeeMessage = async (bot, message, coffeeChannelId) => {

    // message.user is actually the user's ID, not a user object

    if (coffeeData.userIdNeedingCoffee == message.user) {
        bot.reply(message, "I beg thee, please give thy steed time! You are in the queue.");
        return;
    }

    if (coffeeData.userIdNeedingCoffee !== null) {
        // A lot of this can be parallelized, but for easy of dev and error propogation ease, just leave it sync
        // Also slack doesn't like lots of fast API calls.
        
        const otherUserId = coffeeData.userIdNeedingCoffee;

        // Get info about the other user
        const otherUserResp = await pbot.api.users.info({ user: otherUserId });

        ////////////////
        // Message the current user
        bot.reply(
            message,
            `Caffeine be upon you. You are paired with @${otherUserResp.user.name}! Go and burst forth enlightening conversation.`
        );

        ////////////////
        // Message the other user
        
        // Get Catbot's IM with the other user
        const imListing = await pbot.api.im.list({});
        const otherUserIm = imListing.ims.find(im => im.user == otherUserId);

        // Get info about the current user
        const thisUserResp = await pbot.api.users.info({ user: message.user })

        await pbot.api.chat.postMessage(
            {
                as_user: true,
                channel: otherUserIm.id,
                text: `Caffeine be upon you. You are paired with @${thisUserResp.user.name}! Go and burst forth enlightening conversation.`
            },
        );

        await bot.api.chat.postMessage(
            {
                as_user: true,
                channel: coffeeChannelId,
                text: `@${otherUserResp.user.name} and @${thisUserResp.user.name} are getting coffee together!`
            },
        );

        coffeeData.userIdNeedingCoffee = null;
        console.log('Cleared the list of users needing pairing');

        return;
    }

    coffeeData.userIdNeedingCoffee = message.user;

    bot.reply(message, 'I will send coffee on a great steed. You are now in the queue.');

    await pbot.api.chat.postMessage(
        {
            as_user: true,
            channel: coffeeChannelId,
            text: `Someone needs coffee! Who is up to the task?`
        }
    );
};

const configureBot = (coffeeChannelId) => {

    controller.hears(
        ['coffee'],
        'direct_message,direct_mention,mention',
        async (bot, message) => {
            try {
                await processCoffeeMessage(bot, message, coffeeChannelId);
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
};

const main = async () => {
    const resp = await pbot.api.channels.list({});

    const coffeeChannel = resp.channels.find(channel => channel.name == 'coffee');

    if (!coffeeChannel) {
        throw "I can't work without a coffee channel!";
    }

    console.log("Found the coffee channel!");
    console.log(coffeeChannel);

    configureBot(coffeeChannel.id);
}

///////////// Run all the cods

main().catch(err => console.error(err));

