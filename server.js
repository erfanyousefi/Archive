
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
require('dotenv').config();
const app = express();
app.use(cors());
port = process.env.PORT || 8000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ISCRAPE_API_KEY = process.env.ISCRAPE_API_KEY;

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static('public'));

let awaitingDomain = false;
let potentialName = '';
let conversationHistory = [];

app.post('/api/query', async (req, res) => {
  try {
    console.log(req.body);
    const userQuery = req?.body?.query;
    addToConversationHistory('User', userQuery);
    if (!userQuery) return res.send("Please Enter query");
    if (awaitingDomain) {
      // Existing logic for handling domain-related queries
    } else if (userWantsToSummarizeLinkedInProfile(userQuery)) {
      // Logic for summarizing LinkedIn profile
      const linkedInId = extractLinkedInId(userQuery);
      if (!linkedInId) {
        res.json({message: 'Invalid LinkedIn URL provided.'});
        return;
      }

      let profileData = await scrapeLinkedInProfile(linkedInId);
      if (!profileData) {
        res.json({message: 'Error scraping LinkedIn profile.'});
        return;
      }

      const summary = await summarizeProfileWithOpenAI(profileData);
      // Store the summary for later use in generating sales email
      lastLinkedInSummary = summary;
      res.json({message: summary});
    } else if (userQuery.toLowerCase() === "create a sales email for this person") {
      // Logic for generating a sales email
      if (lastLinkedInSummary) {
        const salesEmailContent = await generateSalesEmail(lastLinkedInSummary);
        res.json({message: salesEmailContent});
      } else {
        res.json({message: 'Please summarize a LinkedIn profile first.'});
      }
    } else {
      // Logic for handling other types of queries
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

      res.json({message: botResponse}); // Send the response as JSON
    }
  } catch (error) {
    console.error('Error:', error.response || error);
    res.status(500).json({message: 'An error occurred.', error: error.response || error});
  }
});

// Ensure to define `lastLinkedInSummary` at an appropriate scope where it's accessible
let lastLinkedInSummary = '';

// Also, ensure all other functions used here (like `generateSalesEmail`, `generateSalesConversationPrompt`, etc.) are defined in your application





// New function to generate sales email content
async function generateSalesEmail (linkedInSummary) {
  const prompt = `Create a personalized sales email based on the following LinkedIn profile summary \n\n${linkedInSummary}`;

  try {
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/engines/text-davinci-003/completions',
      {
        prompt: prompt,
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );
    return openaiResponse.data.choices[0].text.trim();
  } catch (error) {
    console.error("Error generating sales email with OpenAI:", error.message);
    throw new Error('Error generating sales email');
  }
}















function addToConversationHistory (role, message) {
  conversationHistory.push({role, message});
  if (conversationHistory.length > 20) {
    conversationHistory.shift();
  }
}

function generateSalesConversationPrompt (userQuery) {
  const recentHistory = conversationHistory
    .slice(-20)
    .map(entry => `${entry.role}: ${entry.message}`)
    .join('\n');
  return `The following is a conversation with an AI sales assistant specializing in writing sales emails, strategizing sales, and creating sales campaigns.\n${recentHistory}\nHuman: ${userQuery}\nAI:`;
}

function userWantsToSummarizeLinkedInProfile (query) {
  const pattern = /^summarize this profile https?:\/\/[www\.]*linkedin\.com\/in\/[a-zA-Z0-9-]+/;
  return pattern.test(query.toLowerCase());
}

function extractLinkedInId (query) {
  const urlPattern = /(https?:\/\/[www\.]*linkedin\.com\/in\/[a-zA-Z0-9-]+)/;
  const match = query.match(urlPattern);
  return match ? new URL(match[0]).pathname.split('/').pop() : null;
}

async function scrapeLinkedInProfile (linkedInId, profileType = 'personal') {
  const url = 'https://api.iscraper.io/v2/profile-details'; // Replace with the actual endpoint of iscraper
  const agent = new https.Agent({
    rejectUnauthorized: false // Bypass SSL certificate verification (use only for debugging)
  });
  try {
    const response = await axios.post(url, {
      profile_id: linkedInId,
      profile_type: profileType,
      bypass_cache: false,  // Set true if you need real-time data
      related_profiles: false,
      network_info: true,
      contact_info: false
    }, {
      headers: {
        'X-API-KEY': ISCRAPE_API_KEY
      }
    });
    return response.data; // Return the profile data if successful
  } catch (error) {
    console.error("Error scraping LinkedIn profile with iscraper:", error.message);
    return null; // Return null or an error message in case of an error
  }
}

async function summarizeProfileWithOpenAI (profileData) {
  let summaryContent = '';

  // Function to add any field with data to the summary
  function addFieldToSummary (field, label) {
    if (profileData[field]) {
      let fieldData = profileData[field];

      // Check if the field is a string and not empty
      if (typeof fieldData === 'string' && fieldData.trim() !== '') {
        summaryContent += `${label}: ${fieldData}\n`;
      }
      // Check if the field is an array and not empty
      else if (Array.isArray(fieldData) && fieldData.length > 0) {
        summaryContent += `${label}:\n`;
        fieldData.forEach(item => {
          summaryContent += ` - ${JSON.stringify(item)}\n`; // You might want to format this better
        });
      }
      // Add other data types handling as needed
    }
  }

  // Iterate over all keys in profileData and add them to the summary
  for (const key in profileData) {
    addFieldToSummary(key, key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '));
  }

  console.log("Constructed Summary Content:", summaryContent);

  if (summaryContent.trim() === '') {
    summaryContent = 'Limited data available to summarize.';
  }

  const prompt = `Summarize the following LinkedIn profile \n\n${summaryContent}. Provide a cohesive condensed summary that's grammatically accurate.`;
  console.log("Prompt sent to OpenAI:", prompt);

  try {
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/engines/text-davinci-003/completions',
      {
        prompt: prompt,
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );
    return openaiResponse.data.choices[0].text.trim();
  } catch (error) {
    console.error("Error summarizing profile with OpenAI:", error.message);
    throw new Error('Error summarizing profile with OpenAI');
  }
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});  