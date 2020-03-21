# telegram-wax-signup

How to install:
---------------

1) Create your bot via Telegram @BotFather
2) Add bot to Wax Telegram group
3) Deactivate "Allow Groups?" functionality in bot setting via Telegram @BotFather
4) Put bot token (key) in config.json > keys.bot
5) Fill the rest of the config.json file
6) Install the dependencies: npm i
6) Launch the script: node index.js

Add authorized groups:
----------------------

1) Add the bot to the desired group
2) Trigger the "/groupId" command on the bot in the new channel
3) Add the ID received into the config.json files, into the authorizedChatGroupIds property. 