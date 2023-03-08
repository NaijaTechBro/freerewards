//Models && Operations
var Users = require('../models/users')
var Videos = require('../models/videos')
var Missions = require('../models/missions')
var Coupons = require('../models/couponsData')
const moment = require('moment')

var cc = require('coupon-code');
var Videos = require('../models/videos')
const md5 = require('md5')
var client = require('redis').createClient();
var RateLimit = require('express-rate-limit');
var RedisStore = require('rate-limit-redis');

const videoCoins = 5;
const dailyCoins = 2;
const maxVideoRequest = 501


module.exports = {
    GET_offerwall: async function (req, res, next) {
        try {
            let missionsArray = await Missions.find()
            let user = await Users.findOne({
                _id: res.locals.user._id
            })
            var missions = []
            //no mission is completed yet  for this user
            if (user.completedMissions.length == 0) {
                missions = missionsArray
            } else {
                missions = missionsArray.filter(function (mission) {
                    for (let i = 0; i < user.completedMissions.length; i++) {
                        if (mission.title == user.completedMissions[i]) {
                            return false
                        }
                    }
                    return mission
                })
            }
            res.render('earncoins/offerwall', {
                helpers: {
                    truncate: function (str, len) {
                        if (str.length > len) {
                            var new_str = str.substr(0, len + 1);

                            while (new_str.length) {
                                var ch = new_str.substr(-1);
                                new_str = new_str.substr(0, -1);

                                if (ch == ' ') {
                                    break;
                                }
                            }

                            if (new_str == '') {
                                new_str = str.substr(0, len);
                            }

                            return new_str.toLowerCase() + '...';
                        }
                        return str;
                    }
                },
                missionsToDisplay: missions
            })
        } catch (err) {
            next(err)
        }
    },
    POST_offerwall_mission_id: async function (req, res, next) {
        console.log(req.params)
        let id = req.params.id
        let missionToPush
        let missionCoins = 0;
        try {
            let mission = await Missions.findOne({
                missionId:id
            })

            let user = await Users.findOne({
                _id: res.locals.user._id
            })
            console.log(mission)
        //   hhh
           updateCoinsInTheParentUser(user.refferedBy, user._id, mission.coins)
            updateCurrentUserCoins(user, mission.coins)
            user.completedMissions.map(function (x) {

                if (x == mission.title) {

                    return res.redirect('/earncoins/offerwall')
                }
            })

            user.completedMissions.push(mission.title);
            user.save(function (err, result) {
                if (err) return next(err)
                res.redirect('/earncoins/offerwall')
            })
        } catch (err) {
            next(err)

        }
    },

    /////////////// DAILY BONUS /////////////////////
    GET_daily: function (req, res, next) {
        res.render('earncoins/daily')
    },
    POST_daily: async function (req, res, next) {
        try {
            let user = await Users.findOne({
                _id: res.locals.user._id
            })
            let n = moment().format('DD/MM/YYYY hh:mm'); // now 
            let l = moment(user.lastdailybonus, 'DD/MM/YYYY hh:mm').format('DD/MM/YYYY hh:mm') //last time bonus day
            let now = moment(n, 'DD/MM/YYYY hh:mm')
            let last = moment(l, 'DD/MM/YYYY hh:mm')
            let duration = moment.duration(now.diff(last));
            let hours = duration.asHours();
            if (hours >= 24) {
                user.totalCoins += dailyCoins;
                user.lastdailybonus = await moment().format('DD/MM/YYYY HH:mm')
                updateCoinsInTheParentUser(user.refferedBy, user._id, dailyCoins)
                updateCurrentUserCoins(user, dailyCoins)
                await user.save()
            }
        } catch (err) {
            next(err)
        }
        res.redirect('/earncoins/daily')
    },

    ////////////// VIDEOS /////////////////////



    GET_videos: async function (req, res, next) {
        // var rateLimitNumber = 0
        // client.get('rl:' + req.ip, async function (err, reply) {
        //     rateLimitNumber = reply

            // console.log(rateLimitNumber)
            // if (rateLimitNumber >= (maxVideoRequest - 1)) {
            //     return res.render('earncoins/videos')
            // }

            let videoArray = await Videos.find({
                $where: 'this.viewsCount < this.maxViews'
            }).sort({
                'viewsCount': 'asc'
            })
            
            var random = Math.round(Math.random() * (videoArray.length + 1));
            var video = videoArray[random]


            res.render('earncoins/videos', {
                video: video
            })
        // })
    },



    POST_videos: async function (req, res, next) {
        console.log(req.body)
        try {

            if (req.rateLimit.remaining <= 0) {
                return res.status(500).send('limit exceeded  ' + req.rateLimit.remaining)
            }


            // if(!(req.body.percent >= 2)){
            //     req.flash('error','you need to watch the video')
            //     return res.redirect('/earncoins/videos')
            // }
            if (Number(req.body.time) >= 30) {


                let video = await Videos.findOne({
                    _id: req.body.videoId
                })
                let user = await Users.findOne({
                    _id: res.locals.user._id
                })

                video.viewsCount += 1;
                user.coins += videoCoins;
                updateCoinsInTheParentUser(user.refferedBy, user._id, videoCoins)
                updateCurrentUserCoins(user, videoCoins)

                await video.save()
                await user.save()
                res.send('success')
            } else {
                return res.status(500).send('Problem with time')
            }
        } catch (err) {
            next(err)

        }
    },
    ////////////////// INVITE //////////////////////////
    GET_invite: async function (req, res) {
        let user = await Users.findOne({
            _id: req.user._id
        })
        res.render('earncoins/invite', {
            refUrl: req.hostname + '/ref/' + user.refferalUrl
        })
    },
    ////////////////////// CODE COUPONS ///////////////////////////////
    GET_code: function (req, res) {
        res.render('earncoins/code')
    },
    POST_code: async function (req, res, next) {
        let code = req.body.redeemcode

        if (validateCoupons(code)) {
            var coupon = await Coupons.findOne({
                couponCode: code
            })
            if (coupon != null) {
                try {
                    var user = await Users.findOne({
                        _id: res.locals.user._id
                    })
                    updateCurrentUserCoins(user, coupon.couponCoins)
                    updateCoinsInTheParentUser(user.refferedBy, user._id, couponCoins)
                    await user.save()
                    await coupon.remove()
                    res.redirect('/earncoins/code')
                } catch (error) {
                    next(error)

                }
            } else {
                req.flash('error', 'invalid coupon')
                res.redirect('/earncoins/code')
            }
        } else {
            req.flash('error', 'invalid coupon')
            res.redirect('/earncoins/code')
        }

    },
    /////////////////////// BUY ///////////////////////::
    GET_buy: function (req, res) {
        res.render('earncoins/buy')
    },
    ////////////////////POSTBACKS///////////////////////////////////////
    GET_kiwi: function (req, res, next) {
        var secret_key = "2cw0280swIKLgrfCYG2Vl0cR4SvnCuqW"
        const {
            status,
            trans_id,
            app_id,
            sub_id,
            sub_id_2,
            gross,
            amount,
            offer_id,
            offer_name,
            category,
            os,
            ip_address,
            signature
        } = req.query
        console.log(req.query)
        var validation = md5(sub_id + ':' + amount + ':' + secret_key)
        if (signature == validation) {
            // res.sendStatus(200)
            console.log('matches')
            Users.findOne({
                _id: sub_id
            }, async function (err, user) {
                if (err) {
                    console.log('error finding')
                    return res.status(200).send('0');
                }
                if (!user) {
                    console.log('user not found')
                    return res.status(200).send('0');
                }
                user.totalCoins += amount
                user.offerWallCoins += amout
                await user.save() //error handling
                res.status(200).send('1');
            })
        } else {
            console.log('deosnt matches')
            res.status(500).send('0');
        }
    },
    GET_superrewards: async function (req, res, next) {
        var secret_key = '5aee4deb34ecf481cd81c9162df82d1a'
        const {
            id,
            total,
            oid,
            sig,
            uid
        } = req.query
        var new_currency = req.query['new']
        var validation = md5(id + ':' + new_currency + ':' + uid + ':' + secret_key)
        if (sig == validation) {

            console.log('matches')
            Users.findOne({
                _id: id
            }, async function (err, user) {
                if (err) {
                    console.log('error finding')
                    return res.status(200).send('0');
                }
                if (!user) {
                    console.log('user not found')
                    return res.status(200).send('0');
                }
                user.totalCoins += new_currency
                user.offerWallCoins += new_currency
                await user.save() //error handling
                res.status(200).send('1');
            })


        } else {
            console.log('deosnt matches')
            res.status(500).send('3')
        }
    },
    GET_personaly: function (req, res, next) {
        const publisher_secret_key = "e19b248b-3f5f-4801-a4a7-9eff3a99ef3a"
        const publisher_hash = '5ae06af33e9cbf00112d53bc'
        const {
            user_id,
            amount,
            placement_id,
            signature
        } = req.query
        var validation = md5(user_id + ':' + publisher_hash + ':' + publisher_secret_key)
        if (signature == validation) {

            console.log('matches')
            Users.findOne({
                _id: user_id
            }, async function (err, user) {
                if (err) {
                    console.log('error finding')
                    return res.status(200).send('0');
                }
                if (!user) {
                    console.log('user not found')
                    return res.status(200).send('0');
                }
                user.totalCoins += amount
                user.offerWallCoins += amount
                await user.save() //error handling
                res.status(200).send('1');
            })


        } else {
            console.log('deosnt matches')
            res.status(500).send('3')
        }
    },
    GET_offerToro: function (req, res, next) {
        const secret = "916c12b24dd2453982d15d14152d1572"
        const {
            user_id,
            oid,
            amount
        } = req.query
        var validation = md5(user_id + ':' + oid + ':' + secret)
        if (signature == validation) {

            console.log('matches')
            Users.findOne({
                _id: user_id
            }, async function (err, user) {
                if (err) {
                    console.log('error finding')
                    return res.status(200).send('0');
                }
                if (!user) {
                    console.log('user not found')
                    return res.status(200).send('0');
                }
                user.totalCoins += amount
                user.offerWallCoins += amount
                await user.save() //error handling
                res.status(200).send('1');
            })

        } else {
            console.log('deosnt matches')
            res.status(500).send('3')
        }
    },
    videoRateLimiter: new RateLimit({
        store: new RedisStore({
            expiry: 12 * 60 * 60 * 1000, // 12 hour window
            // see Configuration
        }),

        // delayAfter: 20, // begin slowing down responses after the first request
        // delayMs: 1000, // slow down subsequent responses by 3 seconds per request
        max: maxVideoRequest, // start blocking after 5 requests
        message: "You have reached the maximum number of coins earned this day, please try again after few hours"
    })

}


var RandomVideo = function RandomVideo(min, max) {
    return Math.floor(Math.random() * (max - min) + min)
}

var validateCoupons = function (coupon) {
    if (cc.validate(coupon, {
            parts: 4
        }).length > 0) {
        return true
    }
    return false
}

function updateCoinsInTheParentUser(refferedBy, thisUserId, coinsToAdd) {
    if (refferedBy) {
        let percentage = 3
        let coinsAfterPercentage = (coinsToAdd / 100 * percentage)
        Users.findOne({
            _id: refferedBy
        }, function (err, refUser) {
            refUser.totalCoins += coinsAfterPercentage
            refUser.childCoins += coinsAfterPercentage
            for (let i = 0; i < refUser.refferedUsers.length; i++) {

                if (refUser.refferedUsers[i].id.toString() == thisUserId.toString()) {

                    refUser.refferedUsers[i]['coins'] += coinsAfterPercentage

                    refUser.save(function (err) {
                        if (err) return console.log(err)
                    })
                    break;
                }
            }
        })
    }
}

function updateCurrentUserCoins(user, coins) {
    user.Earnedcoins += coins
    user.totalCoins += coins

}
async function addOfferWallCoins(id, amount) {

}