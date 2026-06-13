const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allows inline scripts for Tailwind
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// Active subdomains configuration
const ACTIVE_SUBDOMAINS = [
  { subdomain: 'omini', name: 'Omni', description: 'Premium marketplace', icon: 'fa-store' },
  { subdomain: 'devglass', name: 'DevGlass', description: 'Developer portfolio platform', icon: 'fa-code' }
];

const BASE_DOMAIN = 'devfanuel.online';

// Helper: Fetch metadata from subdomain
async function fetchSubdomainMetadata(subdomain) {
  try {
    const url = `https://${subdomain}.${BASE_DOMAIN}`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'DevFanuel-Hub/1.0' }
    });
    
    const $ = cheerio.load(response.data);
    
    let title = $('title').text() || subdomain;
    let description = $('meta[name="description"]').attr('content') || '';
    let ogTitle = $('meta[property="og:title"]').attr('content');
    let ogDescription = $('meta[property="og:description"]').attr('content');
    let ogImage = $('meta[property="og:image"]').attr('content');
    
    // Use OG tags if available
    if (ogTitle) title = ogTitle;
    if (ogDescription) description = ogDescription;
    
    // If still no description, get first paragraph
    if (!description) {
      const firstPara = $('p').first().text();
      if (firstPara) description = firstPara.substring(0, 150);
    }
    
    // Map icons based on subdomain
    const iconMap = {
      'omini': 'fa-store',
      'devglass': 'fa-code'
    };
    
    return {
      subdomain,
      name: title.length > 50 ? title.substring(0, 50) + '...' : title,
      description: description || 'Explore this amazing app',
      url: url,
      icon: iconMap[subdomain] || 'fa-rocket',
      image: ogImage || null,
      isActive: true
    };
  } catch (error) {
    console.error(`Error fetching ${subdomain}:`, error.message);
    return null;
  }
}

// API: Get all active apps with metadata
app.get('/api/apps', async (req, res) => {
  try {
    const appsPromises = ACTIVE_SUBDOMAINS.map(app => fetchSubdomainMetadata(app.subdomain));
    const apps = await Promise.all(appsPromises);
    const validApps = apps.filter(app => app !== null);
    
    res.json({
      success: true,
      apps: validApps,
      count: validApps.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch apps' });
  }
});

// API: Suggest similar subdomains
app.post('/api/suggest', (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.json({ suggestions: ACTIVE_SUBDOMAINS });
  }
  
  const suggestions = ACTIVE_SUBDOMAINS.filter(app => 
    app.subdomain.includes(query.toLowerCase()) ||
    app.name.toLowerCase().includes(query.toLowerCase())
  );
  
  res.json({ suggestions: suggestions.slice(0, 3) });
});

// Main route - Serve the app launcher
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Wildcard subdomain handler
app.get('*', (req, res, next) => {
  const host = req.headers.host;
  const subdomain = host.split('.')[0];
  
  // Check if it's a main domain request
  if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) {
    return next();
  }
  
  // Check if subdomain is active
  const isActive = ACTIVE_SUBDOMAINS.some(app => app.subdomain === subdomain);
  
  if (!isActive && subdomain !== 'www' && subdomain !== BASE_DOMAIN) {
    // Serve custom 404 page for non-existent subdomains
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    next();
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DevFanuel Hub running on port ${PORT}`);
  console.log(`📍 Main domain: https://${BASE_DOMAIN}`);
  console.log(`📊 Active subdomains: ${ACTIVE_SUBDOMAINS.map(a => a.subdomain).join(', ')}`);
});