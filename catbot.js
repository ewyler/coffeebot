// Bullshit to make this work because Procfile only works with web roles, so there
// is no way to specify a fucking non-web role

///////////// Manual config

// The token for the bot to connect to Slack
const SLACK_TOKEN = ''

///////////// Requires

const Botkit = require('botkit');
const express = require('express')
const schedule = require('node-schedule')

///////////// App setup

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

///////////// Real cod

const controller = Botkit.slackbot({
    debug: false
});

const bot = controller.spawn({
    token: SLACK_TOKEN
}).startRTM();

const configureBot = (coffeeChannelId) => {
    controller.hears(
        ['coffee'],
        'direct_message,direct_mention,mention',
        (bot, message) => {
            controller.storage.channels.get(coffeeChannelId, (err, channelStorage) => {
                if (!channelStorage) {
                    channelStorage = {
                        id: coffeeChannelId,
                        userIdsNeedingCoffee: new Set()
                    };
                }

                if (channelStorage.userIdsNeedingCoffee.has(message.user)) {
                    bot.reply(message, "I beg thee, please give thy steed time! You are in the queue.");
                    return;
                }

                if (channelStorage.userIdsNeedingCoffee.size > 0) {
                    const otherUserId = channelStorage.userIdsNeedingCoffee.values().next().value;
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

                        channelStorage.userIdsNeedingCoffee = new Set();
                        controller.storage.channels.save(channelStorage, (err, id) => {
                            if (err) {
                                console.error(err);
                                return;
                            }

                            console.log('Cleared the list of users needing pairing');
                        });

                    });
                    return;
                }

                channelStorage.userIdsNeedingCoffee.add(message.user);

                console.log('Current channel storage');
                console.log(channelStorage);

                controller.storage.channels.save(channelStorage, (err, id) => {
                    if (err) {
                        console.error(err);
                        return;
                    }

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
                });
            });
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

bot.api.channels.list({}, function(err, resp) {
    if (err) {
        console.error(err);
    }
    const coffeeChannel = resp.channels.find(channel => channel.name == 'coffee');

    if (!coffeeChannel) {
        console.error("I can't work without a coffee channel!");
        process.exit();
    }

    console.log("Found the coffee channel!");
    console.log(coffeeChannel);

    configureBot(coffeeChannel.id);
});

