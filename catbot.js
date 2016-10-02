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

///////////// Real cod

const processCoffeeMessage = (bot, message, coffeeChannelId) => {

    messageUserId = message.user;
    if (coffeeData.userIdNeedingCoffee == messageUserId) {
        bot.reply(message, "I beg thee, please give thy steed time! You are in the queue.");
        return;
    }

    if (coffeeData.userIdNeedingCoffee !== null) {
        const otherUserId = coffeeData.userIdNeedingCoffee;
        bot.api.users.info({ user: otherUserId }, (err, otherUserResp) => {

            bot.reply(
                message,
                `Caffeine be upon you. You are paired with @${otherUserResp.user.name}! Go and burst forth enlightening conversation.`
            );

            bot.api.im.list({}, (err, resp) => {
                const otherUserIm = resp.ims.find(im => im.user == otherUserId);

                bot.api.users.info({ user: message.user }, (err, thisUserResp) => {
                    bot.api.chat.postMessage(
                        {
                            as_user: true,
                            channel: otherUserIm.id,
                            text: `Caffeine be upon you. You are paired with @${thisUserResp.user.name}! Go and burst forth enlightening conversation.`
                        },
                        (err, resp) => {
                            if (err) {
                                console.error(err);
                                return;
                            }
                        }
                    );

                    bot.api.chat.postMessage(
                        {
                            as_user: true,
                            channel: coffeeChannelId,
                            text: `@${otherUserResp.user.name} and @${thisUserResp.user.name} are getting coffee together!`
                        },
                        (err, resp) => {
                            if (err) {
                                console.error(err);
                                return;
                            }
                        }
                    );
                });
            });

            coffeeData.userIdNeedingCoffee = null;
            console.log('Cleared the list of users needing pairing');

        });
        return;
    }

    coffeeData.userIdNeedingCoffee = messageUserId;

    bot.reply(message, 'I will send coffee on a great steed. You are now in the queue.');

    bot.api.chat.postMessage(
        {
            as_user: true,
            channel: coffeeChannelId,
            text: `Someone needs coffee! Who is up to the task?`
        },
        (err, resp) => {
            if (err) {
                console.error(err);
                return;
            }
        }
    );
};

const configureBot = async (coffeeChannelId) => {

    controller.hears(
        ['coffee'],
        'direct_message,direct_mention,mention',
        (bot, message) => {
            processCoffeeMessage(bot, message, coffeeChannelId);
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
    const listChannels = promisify(bot.api.channels.list)
    const resp = await listChannels({});

    const coffeeChannel = resp.channels.find(channel => channel.name == 'coffee');

    if (!coffeeChannel) {
        throw "I can't work without a coffee channel!";
    }

    console.log("Found the coffee channel!");
    console.log(coffeeChannel);

    await configureBot(coffeeChannel.id);
}

///////////// Run all the cods

main().catch(err => console.error(err));

