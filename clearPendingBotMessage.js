const Telebot = require('telebot')
const config = require('./config')
const bot = new Telebot(config.keys.bot)

bot.start()

bot.on('text', (msg) => {console.log(`${msg.chat.id} - @${msg.from.username} (${msg.from.id} ${msg.from.first_name}): ${msg.text}`)})

setTimeout(() => {
    console.log('Finished clearing pending messages \nExiting...')
    process.exit(0)
}, 7000)