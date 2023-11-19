require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const request = require('request');

const app = express();
app.use(cors());

app.set('trust proxy', true);

const port = process.env.PORT || 8081;

app.use(express.json());
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

let awaitingDomain = false;
let potentialName = '';
let conversationHistory = [];

// Example request using 'request' module with proxy
request({
    url: 'https://www.google.com',
    proxy: 'http://97.77.104.22:3128'
}, function (error, response, body) {
    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Response:', response);
    }
});

app.post('/api/query', async (req, res) => {
    // ... existing POST endpoint logic ...
});

function addToConversationHistory(role, message) {
    // ... existing function ...
}

function generateSalesConversationPrompt(userQuery) {
    // ... existing function ...
}

app.get('/api/conversation-history', (req, res) => {
    res.json({ history: conversationHistory });
});

app.use('/api', createProxyMiddleware({
    target: 'https://archivebackend-bdf93cdd1c16.herokuapp.com/', 
    changeOrigin: true,
    secure: true, 
    pathRewrite: {
        '^/api': '', 
    },
}));

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
    console.log('OpenAI API Key:', process.env.OPENAI_API_KEY);
});
