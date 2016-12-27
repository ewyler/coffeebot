'use strict';

// Author: Misha the poopman

const needle = require('needle');

const MAGIC_MERGE_LABEL_NAME = 'a magic merge plz';

// this will attempt to auto merge PRs that were approved and have a magic-merge label

const check = (err) => err && console.log('error happen:', err);

module.exports = class {
    constructor(username, password) {
        this.opts = {
            headers: {
                accept: 'application/vnd.github.black-cat-preview+json'
            },
            username: username,
            password: password,
            parse_response: 'json',
            json: true
        };
    }

    mergeApprovedPullRequests(repo) {

        needle.get(`https://api.github.com/repos/catalant/${repo}/pulls`,
            this.opts,
            (err, res, data) => {
                check(err);
                if (!data) {
                    console.log('poop, github doesnt like us');
                    return;
                }

               // uncomment for most useful poops
               // console.log('poop.js - () data', data[0]);

                console.log(`maybe mergable prs in ${repo}: ${data.length}`);
                const prs = data.map(({number, assignee, head}) => ({number, assignee: assignee ? assignee.login : null, sha: head.sha, ref: head.ref}));
                prs.forEach(({number, assignee, sha, ref}) => {

                    // find the reviews for each pr (accepted, changes request, etc.. )
                    needle.get(`https://api.github.com/repos/catalant/${repo}/pulls/${number}/reviews`,
                    this.opts,
                    (err, res, data) => {

                        check(err);

                        const thoughts = data.map(d => {
                            return {
                                user: d.user.login,
                                state: d.state,
                                date: d.submitted_at
                            }
                        });
                        const approved = thoughts.find(t => t.state === 'APPROVED');

                        if (approved) {
                            const mergeData = {
                                sha,
                                commit_title: 'auto merging approved thing',
                                commit_message: `this pr #${number} was approved on ${approved.date} by ${approved.user} so merging this`
                            };

                            needle.get(`https://api.github.com/repos/catalant/${repo}/issues/${number}/labels`,
                                this.opts,
                                (err, res, data) => {

                                    const mmerge = data.find(d => d.name === MAGIC_MERGE_LABEL_NAME);
                                    if (mmerge) {

                                        needle.put(`https://api.github.com/repos/catalant/${repo}/pulls/${number}/merge`,
                                            mergeData, this.opts, (err, res, data) => {
                                                check(err);
                                                console.log(`trying to auto merge #${number} on ${repo}:`, data.message);
                                                if (res.statusCode === 200) {
                                                    // TODO: this delete does not work. i must be doing it wrong

                                                    needle.post(`https://api.github.com/repos/catalant/${repo}/issues/${number}/comments`,
                                                    { body: '☃ magicmerge by dogalant ☃' }, this.opts);

                                                    needle.delete(`https://api.github.com/repos/catalant/${repo}/refs/heads/${ref}`, this.opts, (err, res, data) => {
                                                        check(err);
                                                        console.log('deleted branch', data, `https://api.github.com/repos/catalant/${repo}/refs/heads/${ref}`);
                                                    });
                                                }
                                            }
                                        );
                                    }

                                });
                        } else {
                            console.log(`${repo}: pr #${number} has not yet been approved`);
                        }
                    });
                });
            }
        );
    }
};
