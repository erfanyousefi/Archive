require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const port = process.env.PORT || 8080;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const SCRAPINGDOG_API_KEY = process.env.SCRAPINGDOG_API_KEY;

app.use(express.json());
app.use(express.static("public"));

let awaitingDomain = false;
let potentialName = '';
let conversationHistory = [];

const corsOpts = {
  origin: "*",
  methods: ["GET", "POST"],
  headers: [
    'Content-Type',
    'Authorization',
    'application/json',
    'text/plain',
    '*/*',
  ],
  maxAge: 3600,
};

app.use(cors(corsOpts));



app.post('/api/query', async (req, res) => {
  try {
    const userQuery = req.body.query;
    addToConversationHistory('User', userQuery);

    if (awaitingDomain) {
      // Existing logic for handling domain-related queries
    } else if (userWantsToSummarizeLinkedInProfile(userQuery)) {
      // Logic for summarizing LinkedIn profile
      const linkedInId = extractLinkedInId(userQuery);
      if (!linkedInId) {
        res.json({ message: 'Invalid LinkedIn URL provided.' });
        return;
      }

      let profileData = await scrapeLinkedInProfile(linkedInId);
      if (!profileData) {
        res.json({ message: 'Error scraping LinkedIn profile.' });
        return;
      }

      const summary = await summarizeProfileWithOpenAI(profileData);
      // Store the summary for later use in generating sales email
      lastLinkedInSummary = summary;
      res.json({ message: summary });
    } else if (userQuery.toLowerCase() === "create a sales email for this person") {
      // Logic for generating a sales email
      if (lastLinkedInSummary) {
        const salesEmailContent = await generateSalesEmail(lastLinkedInSummary);
        res.json({ message: salesEmailContent });
      } else {
        res.json({ message: 'Please summarize a LinkedIn profile first.' });
      }
    } else if (userWantsToSummarizeLinkedInProfile(userQuery)) {
      const linkedInId = extractLinkedInId(userQuery);
      if (!linkedInId) {
        res.json({ message: "Invalid LinkedIn URL provided." });
        return;
      }

      let profileData = await scrapeLinkedInProfile(linkedInId);
      if (!profileData) {
        res.json({ message: "Error scraping LinkedIn profile." });
        return;
      }

      if (await profileIsPrivate(profileData)) {
        res.json({ message: "This LinkedIn profile is private." });
        return;
      }

      const summary = await summarizeProfileWithOpenAI(profileData);
      res.json({ message: summary });
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

      res.json({ message: botResponse }); // Send the response as JSON
    }
  } catch (error) {
    console.error('Error:', error.response || error);
    res.status(500).json({ message: 'An error occurred.', error: error.response || error });
  }
});

// Ensure to define `lastLinkedInSummary` at an appropriate scope where it's accessible
let lastLinkedInSummary = '';

// Also, ensure all other functions used here (like `generateSalesEmail`, `generateSalesConversationPrompt`, etc.) are defined in your application





// New function to generate sales email content
async function generateSalesEmail(linkedInSummary) {
  const prompt = `Create a personalized sales email based on the following LinkedIn profile summary.:\n\n${linkedInSummary}. Keep the email short and condensed`;
  
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















function addToConversationHistory(role, message) {
  conversationHistory.push({ role, message });
  if (conversationHistory.length > 20) {
    conversationHistory.shift();
  }
}

function generateSalesConversationPrompt(userQuery) {
  const recentHistory = conversationHistory
    .slice(-20)
    .map(entry => `${entry.role}: ${entry.message}`)
    .join('\n');
  return `The following is a conversation with an AI sales assistant specializing in writing sales emails, strategizing sales, and creating sales campaigns.\n${recentHistory}\nHuman: ${userQuery}\nAI:`;
}

// New functions for LinkedIn profile summarization
function userWantsToSummarizeLinkedInProfile(query) {
  const pattern =
    /^summarize this profile https?:\/\/[www\.]*linkedin\.com\/in\/[a-zA-Z0-9-]+/;
  return pattern.test(query.toLowerCase());
}

function extractLinkedInId(query) {
  const urlPattern = /(https?:\/\/[www\.]*linkedin\.com\/in\/[a-zA-Z0-9-]+)/;
  const match = query.match(urlPattern);
  return match ? new URL(match[0]).pathname.split("/").pop() : null;
}

async function scrapeLinkedInProfile(linkedInId) {
  const url = `https://api.scrapingdog.com/linkedin?api_key=${process.env.SCRAPINGDOG_API_KEY}&linkId=${linkedInId}&type=profile&private=true`;

  try {
    const response = await axios.get(url);
    return response.data; // Return the profile data if successful
  } catch (error) {
    console.error("Error scraping LinkedIn profile:", error.message);
    return null; // Return null or an error message in case of an error
  }
}

async function profileIsPrivate(profileData) {
  console.log("profileData:", profileData);

  if (profileData && profileData.isPrivate) {
    console.log("Profile is private:", profileData.isPrivate);
    await new Promise((resolve) => setTimeout(resolve, 4 * 60 * 1000)); // Wait for 4 minutes
    return true;
  } else {
    console.log("Profile is not private.");
    return false;
  }
}

async function summarizeProfileWithOpenAI(profileData) {
  let summaryContent = "";

  function addFieldToSummary(field, label) {
    console.log(`Processing field: ${field}`); // Debug log
    if (profileData[field]) {
      console.log(`Data for ${field}:`, profileData[field]); // Debug log

      if (
        typeof profileData[field] === "string" &&
        profileData[field].trim() !== ""
      ) {
        // For string fields
        summaryContent += `${label}: ${profileData[field]}\n`;
      } else if (Array.isArray(profileData[field])) {
        // For array fields, format each item
        summaryContent += `${label}:\n`;
        profileData[field].forEach((item, index) => {
          summaryContent += ` - ${formatArrayItem(item)}\n`;
        });
      }
    }
  }

  // New helper function to format each item of the array fields
  function formatArrayItem(item) {
    // Assuming each item is an object with keys you want to summarize.
    // Modify this function based on the actual structure of your items.
    let formattedItem = "";
    if (item.title) formattedItem += `Title: ${item.title}; `;
    if (item.company) formattedItem += `Company: ${item.company}; `;
    if (item.dateRange) formattedItem += `Date: ${item.dateRange}; `;
    if (item.description) formattedItem += `Description: ${item.description}; `;
    // ... add other fields as needed
    return formattedItem;
  }

  console.log("Constructed Summary Content:", summaryContent);

  if (summaryContent.trim() === "") {
    summaryContent = "No sufficient data available to summarize.";
  }

  const prompt = `Summarize the following LinkedIn profile:\n\n${summaryContent}`;
  console.log("Prompt sent to OpenAI:", prompt);

  try {
    const openaiResponse = await axios.post(
      "https://api.openai.com/v1/engines/text-davinci-003/completions",
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
    throw new Error("Error summarizing profile with OpenAI");
  }
}

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
