/**
 * cPanel entry point
 * cPanel's "Setup Node.js App" will execute this file via Passenger.
 * It simply starts the Express backend which also serves the built frontend.
 */
'use strict';

// Pre-load .env before anything else (Passenger cwd = project root)
// override: true so .env values win over Passenger-injected empty vars
const path = require('path');
// Save Passenger's PORT before dotenv overrides it
const _passengerPort = process.env.PORT;
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env'), override: true });
// Restore Passenger's PORT so the app binds on the correct socket/port
if (_passengerPort) process.env.PORT = _passengerPort;

const { startServer } = require('./backend/server.js');
startServer();
