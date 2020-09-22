const express = require('express')
const pug = require('pug');
const fetch = require('node-fetch')
const redis = require('redis')
const mongoose = require('mongoose')
const Schema = mongoose.Schema
const uri = "mongodb+srv://admin:silotech@cluster0.ulm8l.mongodb.net/chat_app?retryWrites=true&w=majority";
mongoose.connect(uri, {useNewUrlParser: true, useUnifiedTopology: true});
const moment = require('moment')

const UserSchema = new Schema({
    userName: {
        type: String,
        unique: true,
        trim: true,
        required: true
    },
    email: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true,
        require: true
    },
    rateLimit: {
        type: Object
    },
    hashedPassword: {
        type: String,
        required: true
    },
    created: {
        type: Date,
        default: Date.now
    }
})
const Users = mongoose.model('Users', UserSchema)

const app = express()
const PORT = 80
const REDIS_PORT = process.env.REDIS_PORT || 6379
const client = redis.createClient(REDIS_PORT)

const getRateLimitUser = async (name) => {
    try {
        const user = await Users.findOne({userName: name})
        return user
    } catch(err) {
        throw new err
    }

}
// set response
function setResponse(username, count, limit) {
    return `<h2> Nick ${username} has ${count} request and ${limit} limit</h2>`
}

const getRequest = (req, res, next) => {
    const {username} = req.params
    // set starttime
    let currentTime = moment().unix()

// check request in minute     
    client.exists("countInSec"+username, "countInMin"+username, async (err, reply) => {
        if(err){
            console.log("problem with redis");
            system.exit(0)
        }
        try {            
            if(reply === 2) {
                client.mget("countInSec"+username, "countInMin"+username, "startTimeSec", "startTimeMin", "limitInSec" + username, "limitInMin" + username, (err, data) => {
                    if (err) throw err
                    // console.log('timeWhenStartSec' + (currentTime - parseInt(data[2])));
                    // console.log('timeWhenStartMin' + (currentTime - parseInt(data[3])));
                    if ((currentTime - parseInt(data[2])) > 1) {
                        client.set("countInSec"+username, 1)
                        client.set("startTimeSec", currentTime)
                        res.render('index', { username: username, countSec: data[0], countMin: data[1], limitSec: data[4], limitMin: data[5] })
                    } 
                    
                    if ((currentTime - parseInt(data[3])) > 60) {
                        client.set("countInMin"+username, 1)
                        client.set("startTimeMin", currentTime)
                        res.render('index', { username: username, countSec: data[0], countMin: data[1], limitSec: data[4], limitMin: data[5] })
                    } 

                    if ((currentTime - parseInt(data[2]) <= 1) && (currentTime - parseInt(data[3]) <= 60) ) {
                        if(parseInt(data[0]) >= parseInt(data[4])) {
                            res.send('<h2>Too many requests in a second </h2>') 
                        } else if  (parseInt(data[1]) >= parseInt(data[5])) {
                            res.send('<h2>Too many requests in a minute </h2>') 
                        }  else {
                            client.incr("countInSec"+username)
                            client.incr("countInMin"+username)
                            // res.send(setResponse(username, data[0], data[2]))
                            res.render('index', { username: username, countSec: data[0], countMin: data[1], limitSec: data[4], limitMin: data[5] })
                        }
                    }
                })
                
            } else {
                // if not exists ("countInMin"+username) in redis, we create it
                const getUser = await getRateLimitUser(username)
                const rateLimit = getUser.rateLimit
                console.log(rateLimit)
                client.set("countInSec"+username, 1)
                client.set("limitInSec"+username, rateLimit.limitInSec)
                client.set("startTimeSec", currentTime)
                client.set("countInMin"+username, 1)
                client.set("limitInMin"+username, rateLimit.limitInMin)
                client.set("startTimeMin", currentTime)
            }       
        } catch (err) {
            console.log(err)
        }
    })

}

app.set('view engine', 'pug')

app.get('/rate/:username', getRequest)

app.listen(PORT, () => {
    console.log(`app listening at port ${PORT}`);
})