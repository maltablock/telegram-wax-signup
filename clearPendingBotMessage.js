const Telebot = require('telebot')
const config = require('./config')
const bot = new Telebot(config.keys.bot)

bot.start()

setTimeout(() => {
    console.log('Finished clearing pending messages \nExiting...')
    process.exit(0)
}, 7000)