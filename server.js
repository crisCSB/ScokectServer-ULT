// Improved WebSocket server with better CORS and error handling
const WebSocket = require('ws');
const http = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');

// Create HTTP server with very permissive CORS
const server = http.createServer((request, response) => {
  // Set very permissive CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', '*');
  response.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  
  // Simple health check endpoint
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ 
      status: 'up',
      connections: wss ? wss.clients.size : 0,
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  // Default response
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('WebSocket server is running');
});

// Create WebSocket server with better error handling
const wss = new WebSocket.Server({ 
  server,
  // Important: Set very permissive origin check
  verifyClient: ({ origin, req, secure }) => {
    // Log connection attempts with origin for debugging
    console.log(`Connection attempt from origin: ${origin || 'unknown'}`);
    return true; // Allow all origins
  },
  clientTracking: true
});

// Override default setupWSConnection to include better logging
const originalSetupWSConnection = setupWSConnection;
const enhancedSetupWSConnection = (conn, req, options = {}) => {
  try {
    console.log('Setting up Y.js connection', {
      remoteAddress: req.socket.remoteAddress,
      path: req.url
    });
    
    // Apply original setup with error handling
    originalSetupWSConnection(conn, req, options);
    
    console.log('Y.js connection successfully established');
  } catch (err) {
    console.error('Error in setupWSConnection:', err);
    // Try to send error to client
    try {
      conn.send(JSON.stringify({
        type: 'error',
        message: err.message
      }));
    } catch (sendErr) {
      console.error('Could not send error to client:', sendErr);
    }
  }
};

// Track connected clients
const clients = new Set();

// Handle new WebSocket connections
wss.on('connection', (ws, req) => {
  // Setup ping/pong for connection monitoring
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  // Add to client tracking
  clients.add(ws);
  
  console.log(`New connection established (total: ${clients.size})`);
  console.log(`Client IP: ${req.socket.remoteAddress}`);
  console.log(`Request URL: ${req.url}`);
  
  // Set up enhanced Y.js connection
  enhancedSetupWSConnection(ws, req);
  
  // Handle disconnections
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Connection closed (remaining: ${clients.size})`);
  });
});

// Health check interval
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating inactive connection');
      clients.delete(ws);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// Clean up on server close
wss.on('close', () => {
  clearInterval(pingInterval);
  console.log('WebSocket server closed');
});

// Get the port from environment or use default
const PORT = process.env.PORT || 1234;
const HOST = '0.0.0.0';

// Start the server
server.listen(PORT, HOST, () => {
  console.log(`
==================================
WebSocket Server Running
==================================
- Port: ${PORT}
- Host: ${HOST}
- Time: ${new Date().toISOString()}
- Clients: ${clients.size}
==================================
  `);
});
