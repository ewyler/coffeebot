'use strict';

require('babel-polyfill');

const FREE_COFFEE = ':coffee: :coffee: :coffee: :coffee: :coffee:'

// Move this to some common core/util area
const once = (target, meth, pd) => {
    const $shadow = Symbol();

    const originalValue = pd.value;

    return {
        value: function() {
            this[$shadow] = $shadow in this ? this[$shadow] : this::originalValue();
            return this[$shadow];
        }
    };
};

module.exports = class {
    constructor(bot) {
        this._bot = bot;
        this._currentState = null;

        // Could do this lazily but we may as well do it right away.
        this.reset().catch(err => console.error(err));
    }

    @once
    async _getCoffeeChannelId() {
        const resp = await this._bot.api.channels.list({});

        const coffeeChannel = resp.channels.find(channel => channel.name == 'coffee');
        if (!coffeeChannel) {
            throw "I can't work without a coffee channel!";
        }

        console.log("Found the coffee channel!");
        console.log(coffeeChannel);

        return coffeeChannel.id
    }

    async _getCurrentState() {
        if (this._currentState === null) {
            await this.reset();
        }

        return this._currentState;
    }

    // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    // Returns a random integer between min (included) and max (included)
    // Using Math.round() will give you a non-uniform distribution!
    _getRandomIntInclusive(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async assignRandomCoffeePairing() {
        const resp = await this._bot.api.users.list({});

        const memberList = resp.members.filter(member => !member.is_bot && !member.deleted);

        const userA = memberList[this._getRandomIntInclusive(0, memberList.length - 1)].name;

        // We could randomly select the same user as the first - so do it a few times as needed.
        let userB = userA;
        while (userB === userA) {
            userB = memberList[this._getRandomIntInclusive(0, memberList.length - 1)].name;
        }

        console.log(`${userA} and ${userB} paired for the daily free coffee!`);

        const coffeeChannelId = await this._getCoffeeChannelId();

        this._bot.api.chat.postMessage(
            {
                as_user: true,
                channel: coffeeChannelId,
                link_names: 1,
                text: `${FREE_COFFEE} @${userA} and @${userB}, you've been randomly selected for the daily free coffee!` +
                    ` Go and burst forth enlightening conversation. You can get the coffee` +
                    ` gift card from John Nylen's desk.`
            },
        );
    }

    async processCoffeeMessage(message) {
        await this._getCurrentState();
        this._currentState = await this._currentState.processCoffeeMessage(message);
    }

    async reset() {
        const coffeeChannelId = await this._getCoffeeChannelId();
        this._currentState = new EmptyCoffeeState(coffeeChannelId, this._bot, new FreeCoffeeCountdown());
    }
};

class FreeCoffeeCountdown {
    constructor() {
        // Always between 0 and 2
        this._freeCoffeeCountdown = Math.floor(Math.random() / 0.35);
    }

    pickMessage(defaultMessage, freeMessage) {
        return defaultMessage;
        // Temporarily disable
        //return this._freeCoffeeCountdown == 0
            //? [FREE_COFFEE, freeMessage, FREE_COFFEE].join(' ')
            //: defaultMessage;
    }

    recordCoffeeMatch() {
        this._freeCoffeeCountdown--;
    }
}

class EmptyCoffeeState {
    constructor(coffeeChannelId, bot, freeCoffeeCountdown) {
        this._coffeeChannelId = coffeeChannelId;
        this._bot = bot;
        this._freeCoffeeCountdown = freeCoffeeCountdown;
    }

    async processCoffeeMessage(message) {
        this._bot.reply(
            message,
            this._freeCoffeeCountdown.pickMessage(
                'I will send coffee on a great steed. You are now in the queue.',
                `Congrats, you're getting free coffee! Now just to find someone else...`
            )
        );

        await this._bot.api.chat.postMessage(
            {
                as_user: true,
                channel: this._coffeeChannelId,
                text: this._freeCoffeeCountdown.pickMessage(
                    `Someone needs coffee! Who is up to the task?`,
                    `Someone needs coffee and the next pair is FREE! Who likes free coffee?`
                )
            }
        );

        return new UserNeedsCoffeeState(this._coffeeChannelId, this._bot, message.user, this._freeCoffeeCountdown);
    }
}

class UserNeedsCoffeeState {
    constructor(coffeeChannelId, bot, userId, freeCoffeeCountdown) {
        this._coffeeChannelId = coffeeChannelId;
        this._bot = bot;
        this._originalUserId = userId;
        this._freeCoffeeCountdown = freeCoffeeCountdown;
    }

    async processCoffeeMessage(message) {
        if (this._originalUserId == message.user) {
            this._bot.reply(message, "I beg thee, please give thy steed time! You are in the queue.");
            return this;
        }

        // A lot of this can be parallelized, but for easy of dev and error propogation ease, just leave it sync
        // Also slack doesn't like lots of fast API calls.

        // Get info about the original user
        const originalUserResp = await this._bot.api.users.info({ user: this._originalUserId });

        ////////////////
        // Message the recently requesting user
        this._bot.reply(
            message,
            this._freeCoffeeCountdown.pickMessage(
                `Caffeine be upon you. You are paired with @${originalUserResp.user.name}!` +
                    ` Go and burst forth enlightening conversation.`,
                `You are paired with @${originalUserResp.user.name}!`
                    + ` Grab the free coffee card from John Nylen's desk.`
            )
        );

        ////////////////
        // Message the original user

        // Get Catbot's IM with the original user
        const imListing = await this._bot.api.im.list({});
        const originalUserIm = imListing.ims.find(im => im.user == this._originalUserId);

        // Get info about the latest user
        const latestUserResp = await this._bot.api.users.info({ user: message.user })

        await this._bot.api.chat.postMessage(
            {
                as_user: true,
                channel: originalUserIm.id,
                text: this._freeCoffeeCountdown.pickMessage(
                    `Caffeine be upon you. You are paired with @${latestUserResp.user.name}!` +
                        ` Go and burst forth enlightening conversation.`,
                    `You are paired with @${latestUserResp.user.name}!`
                        + ` Grab the free coffee card from John Nylen's desk.`
                )
            },
        );

        await this._bot.api.chat.postMessage(
            {
                as_user: true,
                channel: this._coffeeChannelId,
                text: this._freeCoffeeCountdown.pickMessage(
                    `@${originalUserResp.user.name} and @${latestUserResp.user.name} are getting coffee together!`,
                    `@${originalUserResp.user.name} and `
                        + ` @${latestUserResp.user.name} are getting FREE coffee together!`
                        + ` Better luck next time, eh?`
                )
            },
        );

        this._freeCoffeeCountdown.recordCoffeeMatch();
        return new EmptyCoffeeState(this._coffeeChannelId, this._bot, this._freeCoffeeCountdown);
    }
}
