'use strict';

require('babel-polyfill');

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

    async processCoffeeMessage(message) {
        await this._getCurrentState();
        this._currentState = await this._currentState.processCoffeeMessage(message);
    }

    async reset() {
        const coffeeChannelId = await this._getCoffeeChannelId();
        this._currentState = new EmptyCoffeeState(coffeeChannelId, this._bot);
    }
};

class EmptyCoffeeState {
    constructor(coffeeChannelId, bot) {
        this._coffeeChannelId = coffeeChannelId;
        this._bot = bot;
    }

    async processCoffeeMessage(message) {
        this._bot.reply(message, 'I will send coffee on a great steed. You are now in the queue.');

        await this._bot.api.chat.postMessage(
            {
                as_user: true,
                channel: this._coffeeChannelId,
                text: `Someone needs coffee! Who is up to the task?`
            }
        );

        return new UserNeedsCoffeeState(this._coffeeChannelId, this._bot, message.user);
    }
}

class UserNeedsCoffeeState {
    constructor(coffeeChannelId, bot, userId) {
        this._coffeeChannelId = coffeeChannelId;
        this._bot = bot;
        this._originalUserId = userId;
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
            `Caffeine be upon you. You are paired with @${originalUserResp.user.name}! Go and burst forth enlightening conversation.`
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
                text: `Caffeine be upon you. You are paired with @${latestUserResp.user.name}! Go and burst forth enlightening conversation.`
            },
        );

        await this._bot.api.chat.postMessage(
            {
                as_user: true,
                channel: this._coffeeChannelId,
                text: `@${originalUserResp.user.name} and @${latestUserResp.user.name} are getting coffee together!`
            },
        );

        return new EmptyCoffeeState(this._coffeeChannelId, this._bot);
    }
}
