// Improved WebSocket server for Render.com with enhanced error handling
const WebSocket = require('ws');
const http = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');

// Create HTTP server with permissive CORS
const server = http.createServer((request, response) => {
  console.log(`Received HTTP request: ${request.method} ${request.url}`);
  
  // Set permissive CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', '*');
  response.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    response.writeHead(204);
    response.end();
    return;
  }
  
  // Add health check endpoint
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      status: 'ok',
      time: new Date().toISOString(),
      activeConnections: wss ? wss.clients.size : 0
    }));
    return;
  }
  
  // Add root endpoint for basic check
  if (request.url === '/' || request.url === '') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('WebSocket server is running');
    return;
  }
  
  // Fallback for other routes
  response.writeHead(404);
  response.end('Not found');
});

// Create WebSocket server with the HTTP server as a handler
const wss = new WebSocket.Server({ 
  server,
  // Allow more permissive client connections
  perMessageDeflate: false,
  clientTracking: true,
  // Increase timeouts
  pingTimeout: 60000,
  pingInterval: 25000
});

// Track clients for debugging
const clients = new Set();

// Setup connection monitoring
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating inactive connection');
      clients.delete(ws);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Log WebSocket server events
wss.on('listening', () => {
  console.log('WebSocket server is now listening for connections');
});

wss.on('close', () => {
  clearInterval(pingInterval);
  console.log('WebSocket server closed');
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Set up the Y.js WebSocket connection
wss.on('connection', (ws, req) => {
  // Setup ping/pong for connection monitoring
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  // Add to client tracking
  clients.add(ws);
  
  const clientIp = req.socket.remoteAddress;
  console.log(`New WebSocket connection from ${clientIp} (total: ${clients.size})`);
  console.log(`Request URL: ${req.url}`);
  
  // Setup Y.js connection with additional error handling
  try {
    setupWSConnection(ws, req);
    console.log(`Successfully set up Y.js connection for client ${clientIp}`);
    
    // Send welcome message
    try {
      ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to Y.js WebSocket server' }));
    } catch (sendErr) {
      console.error('Error sending welcome message:', sendErr);
    }
    
  } catch (err) {
    console.error('Error in setupWSConnection:', err);
    
    // Try to send error to client before disconnecting
    try {
      ws.send(JSON.stringify({ error: 'Failed to set up Y.js connection' }));
    } catch (sendErr) {
      console.error('Error sending error message to client:', sendErr);
    }
    
    // Close socket with error code
    ws.close(1011, 'Internal server error');
  }
  
  // Handle disconnections
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Connection closed (remaining: ${clients.size})`);
  });
});

// Use Render's PORT environment variable or fallback to 10000
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('==================================');
  console.log('WebSocket Server Running');
  console.log('==================================');
  console.log(`- Port: ${PORT}`);
  console.log(`- Host: ${HOST}`);
  console.log(`- Time: ${new Date().toISOString()}`);
  console.log(`- Clients: ${clients.size}`);
  console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('==================================');
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  clearInterval(pingInterval);
  wss.close(() => {
    console.log('WebSocket server closed');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});
