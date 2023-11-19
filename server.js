require('dotenv').config();
const express = require('express');
const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());

const port = process.env.PORT || 8081;

app.use(express.json());
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

let awaitingDomain = false;
let potentialName = '';
let conversationHistory = [];

app.post('/api/query', async (req, res) => {
  try {
    const userQuery = req.body.query;
    addToConversationHistory('User', userQuery);

    if (awaitingDomain) {
      const domain = userQuery.trim();
      awaitingDomain = false;

      const hunterResponse = await axios.get(
        `https://api.hunter.io/v2/email-finder?domain=${domain}&full_name=${potentialName}&api_key=${HUNTER_API_KEY}`
      );

      if (hunterResponse.data?.data?.email) {
        const email = hunterResponse.data.data.email;
        res.json({ message: `I've found the email! It's ${email}.` });
      } else {
        res.json({ message: "Looks like we weren't able to find that email." });
      }
    } else if (
      /find (the )?email for|what'?s the email for|can you get the email for/.test(
        userQuery.toLowerCase()
      )
    ) {
      const nameMatch = userQuery.match(/for (.+)/i);

      if (nameMatch && nameMatch[1]) {
        potentialName = nameMatch[1].trim();
        awaitingDomain = true;
        res.json({ message: 'Sure, can you provide the domain?' });
      } else {
        res.json({ message: 'Please provide a full name in your query.' });
      }
    } else {
      const conversationPrompt = generateSalesConversationPrompt(userQuery);
      const openaiResponse = await axios.post(
        'https://api.openai.com/v1/engines/text-davinci-003/completions',
        {
          prompt: conversationPrompt,
          max_tokens: 150,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
        }
      );

      const botResponse = openaiResponse.data.choices[0].text.trim();
      addToConversationHistory('Bot', botResponse);

      res.json({ message: botResponse }); // Send the response as JSON
    }
  } catch (error) {
    console.error('Error:', error.response || error);
    res.status(500).json({ message: 'An error occurred.', error: error.response || error });
  }
});

function addToConversationHistory(role, message) {
  conversationHistory.push({ role, message });
  if (conversationHistory.length > 20) {
      conversationHistory.shift();
  }
}

async function makeRequestThroughProxy(url) {
  const proxyAgent = new HttpsProxyAgent('https://archivebackend-bdf93cdd1c16.herokuapp.com/');

  try {
      const response = await axios.get(url, { httpsAgent: proxyAgent });
      console.log(response.data);
      return response.data;
  } catch (error) {
      console.error('Error making request through proxy:', error);
      throw error; // Rethrow the error for further handling
  }
}

function generateSalesConversationPrompt(userQuery) {
  const recentHistory = conversationHistory
      .slice(-20)
      .map(entry => `${entry.role}: ${entry.message}`)
      .join('\n');
  return `The following is a conversation with an AI sales assistant specializing in writing sales emails, strategizing sales, and creating sales campaigns.\n${recentHistory}\nHuman: ${userQuery}\nAI:`;
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