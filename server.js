const WebSocket = require('ws');
const http = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');
const { networkInterfaces } = require('os');

// Configure allowed origins (update these based on your deployment)
const ALLOWED_ORIGINS = [
  // Development origins
  'http://localhost:3000',
  'https://localhost:3000',
  'http://127.0.0.1:3000',
  // Add your production domains here
  'https://yourdomain.com',
  'https://www.yourdomain.com',
  // If deploying on Cloudflare, add those domains
  'https://your-cloudflare-pages-domain.pages.dev',
  'https://collabsimpli.com'
];

// Create HTTP server with CORS support
const server = http.createServer((request, response) => {
  // Get origin from headers
  const origin = request.headers.origin;
  
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Origin', 
    ALLOWED_ORIGINS.includes(origin) ? origin : '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  
  // Health check endpoint
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      connections: wss ? wss.clients.size : 0
    }));
    return;
  }
  
  // Default response
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('WebSocket server is running');
});

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  // Increase timeout values for better reliability
  clientTracking: true,
  perMessageDeflate: true,
});

// Set up Yjs WebSocket connection handler
wss.on('connection', (ws, req) => {
  // Enable ping/pong to detect dead connections
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Set up the Yjs WebSocket connection
  setupWSConnection(ws, req);
  
  console.log(`Client connected. Total connections: ${wss.clients.size}`);
  
  // Log disconnections
  ws.on('close', () => {
    console.log(`Client disconnected. Remaining connections: ${wss.clients.size}`);
  });
});

// Set up heartbeat interval to detect dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating dead connection');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000); // Check every 30 seconds

// Clean up interval on server close
wss.on('close', () => {
  clearInterval(interval);
});

// Handle server shutdown gracefully
function handleShutdown() {
  console.log('Shutting down WebSocket server...');
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
    
    // Close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

// Set up signal handlers for graceful shutdown
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

// Get the port from environment or use default
const PORT = process.env.PORT || 1234;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 allows connections from any IP

// Start the server
server.listen(PORT, HOST, () => {
  console.log(`\n🚀 WebSocket server running on port ${PORT}`);
  
  // Display connection information
  console.log('\n==== CONNECTION INFO ====');
  console.log(`Local: ws://localhost:${PORT}`);
  
  // Get and display local network IPs
  const nets = networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  
  if (results.length > 0) {
    console.log('\n==== NETWORK ACCESS ====');
    console.log('Share these URLs with collaborators on your network:\n');
    
    results.forEach(ip => {
      console.log(`Network: ws://${ip}:${PORT}`);
    });
  }
  
  console.log('\n==== CLIENT CONFIG ====');
  console.log('In your client config, set this URL for websocket connections:');
  console.log(`  -> ws://YOUR_SERVER_IP:${PORT}\n`);
  
  console.log('==== HEALTH CHECK ====');
  console.log(`Health check: http://localhost:${PORT}/health\n`);
});
