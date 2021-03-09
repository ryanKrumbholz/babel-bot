
const config = require('./config.json');
const Discord = require('discord.js');
const fs = require('fs');
const client = new Discord.Client();
const axios = require('axios');
const ogg = require('ogg');

async function transcribe(voiceChannel, message) {
    const usersCount = voiceChannel.members.size;
    const users = [];

    for (let i = 0; i < usersCount - 1; i++) {
        users.push(voiceChannel.members.array()[i].user);
    }

	const connection = await voiceChannel.join();
    
    connection.on('speaking', async (user, speaking) => {

        // Value is 1 if user is speaking; if user speaking then...
        if (speaking.bitfield === 1) {
            
            // Audio from user
            const audio = connection.receiver.createStream(user, {mode: 'pcm'});

            // PCM file output
            const file = fs.createWriteStream(`${user.id}.pcm`);
            audio.pipe(file);

        } else {

            //Converts pcm file to mp3 file with userid name
            convert(user.id);

            // Sends file to api to be uploaded
            const url = await uploadFile(`./${user.id}.mp3`);

            // Gets transcription text back from api
            const words = await getTranscription(url);

            // Sends message with transcription
            message.channel.send(user.username + ' said: ' + words);
            console.log(`I stopped listening to ${user.username}`);
        }
      });
}

// Gets passed file path of mp3 file to upload to api server for transcription
function uploadFile(path) {
   const file = fs.readFileSync(path, 'utf8');

   // Post request to api for file upload
   return axios.post('https://api.assemblyai.com/v2/upload', file, {
       headers: {
        authorization: config.ai_token
       }
   }).then(res => {

        // Upload URL for transcription
        return res.data.upload_url;
   });
}


// Gets passed url of file after file upload
async function getTranscription(url) {
    let text = '';

    // gets id from api after 
    const id = await axios.post('https://api.assemblyai.com/v2/transcript', {
        audio_url: url
    }, {
        headers: {
         'authorization': config.ai_token,
         'content-type': 'application/json'
        }
    }).then(res => {

        // We need this later to get transcription status
        return res.data.id
    });

    // Initialize status var to keep track of transcription status
    let status = "queued";

    while (status !== 'completed') {
        let data = await axios.get('https://api.assemblyai.com/v2/transcript/' + id, {
        // Headers
        headers: {
         'authorization': config.ai_token,
         'content-type': 'application/json'
        }
    }).then(res => {
        // Status code and text of transcription
        return [res.data.status, res.data.text];
    });

        // Status of transcription
        status = data[0];

        // Transcription text
        text = data[1];

        if (status === 'error') {
            // Returns message when receives error code from API
            return 'Error, voice could not be transcribed';
        }
    }
    return text;
    
}

async function convert(userid){
    const ffmpeg = require('child_process').exec;

    // Input PCM file
    const input = `${userid}.pcm`;

    // Output MP3 file
    const output = `${userid}.mp3`;

    // Calls ffmpeg command and passes params
    ffmpeg("ffmpeg -y -f s16le -ar 44.1k -ac 2 -i " + input + " " + output);
}

function endTranscription(channel) {
    // Bot leaves voice channel
    channel.leave();
}

client.once('ready', () => {
	console.log('Ready!');
});

client.on('message', message => {

    // If message contents is "!transcribe" get channel and transcribe audio
    if (message.content === '!transcribe') {
        const channel = message.member.voice.channel;
        transcribe(channel, message);
    }

    // Disconnects bot from given user is in voice channel;
    if (message.content === '!end') {
        endTranscription(message.member.voice.channel);
    }
})



// Login to client
client.login(config.token);